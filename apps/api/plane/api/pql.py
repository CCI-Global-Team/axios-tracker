# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: GAM-737 - a limited PQL subset, translated into IssueFilterSet JSON for the filter engine."""

import re
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import Cycle, Project
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet

# PQL field -> (IssueFilterSet name, value kind)
FIELDS = {
    "assignee": ("assignee_id", "uuid"),
    "state": ("state_id", "uuid"),
    "stategroup": ("state_group", "state_group"),
    "priority": ("priority", "priority"),
    "label": ("label_id", "uuid"),
    "cycle": ("cycle_id", "uuid"),
    "module": ("module_id", "uuid"),
    "project": ("project_id", "uuid"),
    "createdby": ("created_by_id", "uuid"),
    "mention": ("mention_id", "uuid"),
    "subscriber": ("subscriber_id", "uuid"),
    "startdate": ("start_date", "date"),
    "duedate": ("target_date", "date"),
    "createdat": ("created_at", "date"),
    "updatedat": ("updated_at", "date"),
}
USER_FIELDS = {"assignee", "createdby", "mention", "subscriber"}
NULLABLE_FIELDS = {"assignee", "label", "cycle", "module"}
CHOICES = {
    "state_group": ("backlog", "unstarted", "started", "completed", "cancelled"),
    "priority": ("urgent", "high", "medium", "low", "none"),
}
STATE_GROUP_FUNCTIONS = {
    "openstates": ("backlog", "unstarted", "started"),
    "closedstates": ("completed", "cancelled"),
    "activestates": ("unstarted", "started"),
}
KEYWORDS = {"and", "or", "not", "in", "is", "null", "empty", "between"}
EARLIEST, LATEST = date(1, 1, 1), date(9999, 12, 31)

SUPPORTED = (
    "Axios supports these PQL fields: assignee, state, stateGroup, priority, label, cycle, module, project, "
    "createdBy, mention, subscriber, startDate, dueDate, createdAt, updatedAt. Operators: =, !=, IN, NOT IN, "
    "AND, OR, NOT and parentheses; IS [NOT] NULL and IS [NOT] EMPTY on assignee, label, cycle and module; "
    '<, <=, >, >= and BETWEEN on dates written "YYYY-MM-DD". Functions: currentUser(), activeCycle(), '
    "openStates(), closedStates() and activeStates()."
)

TOKEN_RE = re.compile(
    r"""\s*(?:
    (?P<string>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')
    |(?P<op>!=|>=|<=|=|<|>|~|\(|\)|,)
    |(?P<word>[A-Za-z_][A-Za-z0-9_]*)
    |(?P<number>-?\d+(?:\.\d+)?)
    )""",
    re.VERBOSE,
)


class PQLError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "invalid_pql"

    def __init__(self, message):
        super().__init__({"pql": message})


def unsupported(what):
    return PQLError(
        f"{what} isn't supported on Axios, so retrying with it won't help. {SUPPORTED} "
        "Leave that condition out and filter the results yourself."
    )


def tokenize(text):
    tokens, pos = [], 0
    while pos < len(text):
        if text[pos:].strip() == "":
            break
        match = TOKEN_RE.match(text, pos)
        if not match or match.end() == pos:
            raise PQLError(f"Couldn't read the PQL at character {pos + 1} ({text[pos : pos + 10]!r}). {SUPPORTED}")
        kind = match.lastgroup
        value = match.group(kind)
        if kind == "string":
            value = re.sub(r"\\(.)", r"\1", value[1:-1])
        tokens.append((kind, value, match.start(kind)))
        pos = match.end()
    return tokens


class Parser:
    def __init__(self, text, user_id, project_ids):
        self.tokens = tokenize(text)
        self.i = 0
        self.user_id = user_id
        self.project_ids = project_ids

    def peek(self, offset=0):
        index = self.i + offset
        return self.tokens[index] if index < len(self.tokens) else (None, None, None)

    def next(self):
        token = self.peek()
        if token[0] is None:
            raise PQLError(f"The PQL ended too early. {SUPPORTED}")
        self.i += 1
        return token

    def is_keyword(self, word, offset=0):
        kind, value, _ = self.peek(offset)
        return kind == "word" and value.lower() == word

    def is_op(self, op, offset=0):
        kind, value, _ = self.peek(offset)
        return kind == "op" and value == op

    def expect_op(self, op):
        kind, value, pos = self.next()
        if kind != "op" or value != op:
            raise PQLError(f"Expected {op!r} at character {pos + 1}, found {value!r}.")

    def expect_keyword(self, word):
        kind, value, pos = self.next()
        if kind != "word" or value.lower() != word:
            raise PQLError(f"Expected {word.upper()} at character {pos + 1}, found {value!r}.")

    def parse(self):
        node = self.parse_or()
        if self.peek()[0] is not None:
            _, value, pos = self.peek()
            raise PQLError(f"Unexpected {value!r} at character {pos + 1}.")
        return node

    def parse_or(self):
        parts = [self.parse_and()]
        while self.is_keyword("or"):
            self.next()
            parts.append(self.parse_and())
        return parts[0] if len(parts) == 1 else {"or": parts}

    def parse_and(self):
        parts = [self.parse_not()]
        while self.is_keyword("and"):
            self.next()
            parts.append(self.parse_not())
        return parts[0] if len(parts) == 1 else {"and": parts}

    def parse_not(self):
        if self.is_keyword("not"):
            self.next()
            return {"not": self.parse_not()}
        if self.is_op("("):
            self.next()
            node = self.parse_or()
            self.expect_op(")")
            return node
        return self.parse_condition()

    def parse_condition(self):
        kind, word, pos = self.next()
        if kind == "word" and self.is_op("("):
            raise unsupported(f"{word}()")
        if kind != "word" or word.lower() in KEYWORDS:
            raise PQLError(f"Expected a field name at character {pos + 1}, found {word!r}. {SUPPORTED}")
        field = word.lower()
        if field not in FIELDS:
            raise unsupported(f"The field {word!r}")

        if self.is_keyword("is"):
            self.next()
            negate = self.is_keyword("not")
            if negate:
                self.next()
            if not (self.is_keyword("null") or self.is_keyword("empty")):
                raise PQLError(f"Expected NULL or EMPTY after IS on {word}.")
            self.next()
            if field not in NULLABLE_FIELDS:
                raise unsupported(f"IS NULL / IS EMPTY on {word}")
            return {f"{FIELDS[field][0]}__isnull": not negate}

        if self.is_keyword("not") and self.is_keyword("in", 1):
            self.i += 2
            return {"not": self.membership(field, word)}
        if self.is_keyword("in"):
            self.next()
            return self.membership(field, word)

        if self.is_keyword("between"):
            self.next()
            if self.is_op("("):
                self.next()
                low = self.value()
                self.expect_op(",")
                high = self.value()
                self.expect_op(")")
            else:
                low = self.value()
                self.expect_keyword("and")
                high = self.value()
            return self.date_range(field, word, self.one_date(field, word, low), self.one_date(field, word, high))

        op_kind, op, op_pos = self.next()
        if op_kind != "op" or op not in ("=", "!=", "<", "<=", ">", ">="):
            if op == "~":
                raise unsupported("The ~ (contains) operator")
            raise PQLError(f"Expected an operator after {word} at character {op_pos + 1}, found {op!r}.")
        value = self.value()

        if FIELDS[field][1] == "date":
            day = self.one_date(field, word, value)
            if op in ("=", "!="):
                leaf = {FIELDS[field][0]: day.isoformat()}
                return {"not": leaf} if op == "!=" else leaf
            try:
                low, high = {
                    "<": (EARLIEST, day - timedelta(days=1)),
                    "<=": (EARLIEST, day),
                    ">": (day + timedelta(days=1), LATEST),
                    ">=": (day, LATEST),
                }[op]
            except OverflowError:
                raise PQLError(f"The date {day.isoformat()} is out of range for {word} {op}.")
            return self.date_range(field, word, low, high)

        if op not in ("=", "!="):
            raise unsupported(f"The {op} operator on {word}")
        leaf = self.leaf(field, self.resolve(field, word, value))
        return {"not": leaf} if op == "!=" else leaf

    def membership(self, field, word):
        if FIELDS[field][1] == "date":
            raise unsupported(f"IN on {word}")
        if self.peek()[0] == "word":
            values = self.resolve(field, word, self.value())
        else:
            self.expect_op("(")
            values = self.resolve(field, word, self.value())
            while self.is_op(","):
                self.next()
                values += self.resolve(field, word, self.value())
            self.expect_op(")")
        return self.leaf(field, values)

    def value(self):
        kind, value, pos = self.next()
        if kind == "string":
            return ("string", value)
        if kind == "word" and self.is_op("("):
            self.next()
            args = []
            while not self.is_op(")"):
                args.append(self.value())
                if not self.is_op(")"):
                    self.expect_op(",")
            self.next()
            return ("function", value, args)
        raise PQLError(f"Expected a quoted value or a function at character {pos + 1}, found {value!r}. {SUPPORTED}")

    def resolve(self, field, word, value):
        name, kind = FIELDS[field]
        if value[0] == "function":
            function = value[1].lower()
            if function == "currentuser" and field in USER_FIELDS:
                return [str(self.user_id)]
            if function == "activecycle" and field == "cycle":
                return self.active_cycles()
            if function in STATE_GROUP_FUNCTIONS and field == "stategroup":
                return list(STATE_GROUP_FUNCTIONS[function])
            raise unsupported(f"{value[1]}() on {word}")

        text = value[1]
        if kind == "uuid":
            try:
                return [str(uuid.UUID(text))]
            except ValueError:
                raise PQLError(
                    f"{word} takes a UUID, not {text!r}. Look the UUID up with the matching list action first "
                    "(member, state, label, cycle, module or project), then retry."
                )
        if kind in CHOICES:
            if text.lower() not in CHOICES[kind]:
                raise PQLError(f"{word} must be one of {', '.join(CHOICES[kind])}, not {text!r}.")
            return [text.lower()]
        raise unsupported(f"The value {text!r} on {word}")

    def one_date(self, field, word, value):
        if FIELDS[field][1] != "date":
            raise unsupported(f"Date comparisons on {word}")
        if value[0] == "function":
            raise unsupported(f"{value[1]}() on {word}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value[1]):
            raise PQLError(f'{word} takes a date written "YYYY-MM-DD", not {value[1]!r}.')
        try:
            return date.fromisoformat(value[1])
        except ValueError:
            raise PQLError(f"{value[1]!r} isn't a valid date for {word}.")

    def date_range(self, field, word, low, high):
        if low > high:
            raise PQLError(f"The date range on {word} is empty ({low.isoformat()} is after {high.isoformat()}).")
        return {f"{FIELDS[field][0]}__range": f"{low.isoformat()},{high.isoformat()}"}

    def leaf(self, field, values):
        name = FIELDS[field][0]
        if len(values) == 1:
            return {name: values[0]}
        return {f"{name}__in": ",".join(values)}

    def active_cycles(self):
        now = timezone.now()
        cycle_ids = list(
            Cycle.objects.filter(
                project_id__in=self.project_ids,
                start_date__lte=now,
                end_date__gte=now,
                archived_at__isnull=True,
            ).values_list("id", flat=True)
        )
        if cycle_ids:
            return [str(cycle_id) for cycle_id in cycle_ids]
        identifiers = sorted(Project.objects.filter(id__in=self.project_ids).values_list("identifier", flat=True))
        where = ", ".join(identifiers) if 0 < len(identifiers) <= 5 else "any of your projects"
        raise PQLError(
            f"There's no active cycle in {where}: no cycle has a start and end date around today, so "
            "activeCycle() would match nothing. Find the cycle with `cycle list` and filter on its UUID "
            'instead, for example cycle = "<cycle id>".'
        )


class SetFilterBackend(ComplexFilterBackend):
    """Each leaf becomes a subquery, so AND/OR/NOT across many-valued relations mean set operations."""

    def _build_leaf_q(self, leaf_conditions, view, queryset):
        leaf_q = super()._build_leaf_q(leaf_conditions, view, queryset)
        return Q(pk__in=queryset.model.objects.filter(leaf_q).values("pk"))


FILTER_VIEW = SimpleNamespace(filterset_class=IssueFilterSet)


def parse_pql(request, project_ids):
    """The filter tree for the request's ``pql``, or None when there isn't one."""
    text = (request.GET.get("pql") or "").strip()
    if not text:
        return None
    return Parser(text, request.user.id, project_ids).parse()


def filter_by_pql(queryset, tree):
    if tree is None:
        return queryset
    try:
        return SetFilterBackend().filter_queryset(None, queryset, FILTER_VIEW, filter_data=tree)
    except DRFValidationError as exc:
        detail = exc.detail.get("message") if isinstance(exc.detail, dict) else exc.detail
        raise PQLError(f"{detail}. {SUPPORTED}")

"use client";

import { useState } from "react";
import { observer } from "mobx-react";
// types
import type { TDisciplineChoice } from "@plane/types";
// ui
import { CustomSearchSelect, Tooltip } from "@plane/ui";

type Props = {
  memberId: string;
  value: string[];
  choices: TDisciplineChoice[];
  /** where the value came from; shown on hover so a lead can judge how firm the label is */
  source?: string;
  canEdit: boolean;
  onChange: (memberId: string, disciplines: string[]) => Promise<void>;
};

// Matches MAX_DISCIPLINES in the API serializer. Past three the label stops narrowing anything,
// which is the only thing it is for.
const MAX_DISCIPLINES = 3;

export const DisciplineCell: React.FC<Props> = observer((props) => {
  const { memberId, value, choices, source, canEdit, onChange } = props;
  const [saving, setSaving] = useState(false);

  const labelFor = (slug: string) => choices.find((c) => c.value === slug)?.label ?? slug;

  const handleChange = async (next: string[]) => {
    // Silently dropping the fourth pick would look like the click missed. Keep the first three
    // and let the API be the one that refuses anything longer.
    const capped = next.slice(0, MAX_DISCIPLINES);
    setSaving(true);
    try {
      await onChange(memberId, capped);
    } finally {
      setSaving(false);
    }
  };

  const chips = (
    <div className="flex flex-wrap gap-1">
      {value.length === 0 ? (
        <span className="text-tertiary">&mdash;</span>
      ) : (
        value.map((slug) => (
          <span
            key={slug}
            className="border-custom-border-200 bg-custom-background-80 text-xs rounded border px-1.5 py-0.5 whitespace-nowrap"
          >
            {labelFor(slug)}
          </span>
        ))
      )}
    </div>
  );

  const withSource = source ? (
    <Tooltip tooltipContent={`Source: ${source}`} position="top">
      <div>{chips}</div>
    </Tooltip>
  ) : (
    chips
  );

  if (!canEdit) return <div className="w-48">{withSource}</div>;

  return (
    <div className={`w-48 ${saving ? "opacity-60" : ""}`}>
      <CustomSearchSelect
        value={value}
        onChange={handleChange}
        options={choices.map((c) => ({ value: c.value, query: c.label, content: <div>{c.label}</div> }))}
        label={withSource}
        multiple
        noChevron
        disabled={saving}
        optionsClassName="w-48"
        customButtonClassName="w-full text-left"
      />
    </div>
  );
});

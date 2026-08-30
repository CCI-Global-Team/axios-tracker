/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import Link from "next/link";
import { EAuthModes } from "@plane/constants";

interface TermsAndConditionsProps {
  authType?: EAuthModes;
}

// CCI: upstream pointed these at plane.so's own Terms of Service and Privacy Policy. On a CCI-run
// instance that told every volunteer, at the moment they signed in, that Plane Software, Inc.'s terms
// governed their relationship with CCI — which is not true, and is a data-protection statement rather
// than a branding one.
//
// Rather than invent CCI URLs, the notice is not rendered at all (see below). Asserting nothing is
// correct; asserting someone else's terms is not. To restore it, put CCI's own published Terms and
// Privacy Policy URLs here and drop the early return in TermsAndConditions.
const LEGAL_LINKS = {
  termsOfService: "",
  privacyPolicy: "",
} as const;

const MESSAGES = {
  [EAuthModes.SIGN_UP]: "By creating an account",
  [EAuthModes.SIGN_IN]: "By signing in",
} as const;

// Reusable link component to reduce duplication
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-secondary" target="_blank" rel="noopener noreferrer">
      <span className="text-13 font-medium underline hover:cursor-pointer">{children}</span>
    </Link>
  );
}

export function TermsAndConditions({ authType = EAuthModes.SIGN_IN }: TermsAndConditionsProps) {
  // CCI: suppressed until CCI publishes its own Terms and Privacy Policy — see LEGAL_LINKS above.
  if (!LEGAL_LINKS.termsOfService || !LEGAL_LINKS.privacyPolicy) return null;

  return (
    <div className="flex items-center justify-center">
      <p className="text-center text-13 whitespace-pre-line text-tertiary">
        {`${MESSAGES[authType]}, you understand and agree to \n our `}
        <LegalLink href={LEGAL_LINKS.termsOfService}>Terms of Service</LegalLink> and{" "}
        <LegalLink href={LEGAL_LINKS.privacyPolicy}>Privacy Policy</LegalLink>.
      </p>
    </div>
  );
}

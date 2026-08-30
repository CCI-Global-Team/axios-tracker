/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: upstream's AuthFooter advertised Plane's own hosted-product customer count
// ("Join 10,000+ teams building with Plane") alongside real third-party customer
// logos (Zerodha, Sony, Dolby, Accenture) that belong to Plane Software, Inc., not
// CCI. Neither claim is true of this internal Axios instance, so the footer is
// intentionally empty rather than rebranded.
export function AuthFooter() {
  return null;
}

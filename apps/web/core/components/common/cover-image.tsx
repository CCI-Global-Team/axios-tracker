/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { cn } from "@plane/utils";
// helpers
import { getCoverImageDisplayURL, DEFAULT_COVER_IMAGE_URL } from "@/helpers/cover-image.helper";

type TCoverImageProps = {
  /** The cover image URL - can be static, uploaded, or external */
  src: string | null | undefined;
  /** Alt text for the image */
  alt?: string;
  /** Additional className for the image or skeleton */
  className?: string;
  /** Whether to show default image when src is null/undefined. If false, shows loading skeleton */
  showDefaultWhenEmpty?: boolean;
  /** Custom fallback URL to use instead of DEFAULT_COVER_IMAGE_URL */
  fallbackUrl?: string;
  /** CCI: a flat colour shown when there is no cover or it fails to load, instead of a grey skeleton. */
  fallbackColor?: string;
} & React.ComponentProps<"img">;

/**
 * A reusable cover image component that handles:
 * - Loading states with skeleton
 * - Static images (local assets)
 * - Uploaded images (processed through getFileURL)
 * - External URLs
 * - Fallback to default cover image
 */
export function CoverImage(props: TCoverImageProps) {
  const {
    src,
    alt = "Cover image",
    className,
    showDefaultWhenEmpty = false,
    fallbackUrl = DEFAULT_COVER_IMAGE_URL,
    fallbackColor,
    ...restProps
  } = props;
  const [failed, setFailed] = useState(false);

  // CCI: with a fallback colour, a missing or broken cover is a flat tint, never alt text over a gradient.
  if (fallbackColor && (failed || (!src && !showDefaultWhenEmpty))) {
    return <div className={className} style={{ background: fallbackColor }} />;
  }

  // Show loading skeleton when src is undefined/null and we don't want to show default
  if (!src && !showDefaultWhenEmpty) {
    return <div className={cn("animate-pulse bg-layer-2", className)} />;
  }

  const displayUrl = getCoverImageDisplayURL(src, fallbackUrl);

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={cn("object-cover", className)}
      {...restProps}
      onError={(e) => {
        setFailed(true);
        restProps.onError?.(e);
      }}
    />
  );
}

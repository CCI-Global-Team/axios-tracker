/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
};

/**
 * CCI: view an image attachment without leaving the work item.
 *
 * Previously every attachment - screenshots included - was a link that put a file in your downloads
 * folder. Reviewing a bug report meant leaving the tracker, opening the file, and coming back.
 */
export const AttachmentImagePreview = ({ isOpen, onClose, src, alt }: Props) => {
  const [failed, setFailed] = useState(false);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIXL}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-3">
          <p className="truncate text-13 font-medium text-primary">{alt}</p>
          {/* Still reachable as a file: previewing is the common case, but people do need the
              original - to attach it elsewhere, or when the preview cannot render it. */}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 text-11 text-tertiary underline hover:text-secondary"
          >
            Open original
          </a>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-layer-1 p-4">
          {failed ? (
            // A broken image with no explanation reads as a broken app; say what happened and
            // leave the file reachable.
            <p className="text-13 text-tertiary">
              This image could not be displayed.{" "}
              <a href={src} target="_blank" rel="noreferrer" className="underline hover:text-secondary">
                Open it directly
              </a>
              .
            </p>
          ) : (
            <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
          )}
        </div>
      </div>
    </ModalCore>
  );
};

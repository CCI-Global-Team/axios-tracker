/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * CCI: shared motion for Base UI popups. They grow from their trigger (Base UI sets --transform-origin)
 * and leave faster than they arrive. Tailwind's scale-* and translate-* set the scale and translate
 * properties, so those are what transition, not transform.
 */

/** Menus and popovers: 150 ms in, 100 ms out. */
export const POPUP_MOTION =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 ease-out-strong " +
  "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-100 data-[ending-style]:ease-exit";

/** Tooltips: quicker and smaller, 120 ms in, 80 ms out; instant between neighbouring tooltips. */
export const TOOLTIP_MOTION =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-120 ease-out-strong " +
  "data-[starting-style]:scale-97 data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[ending-style]:duration-80 data-[ending-style]:ease-exit " +
  "data-[instant]:transition-none";

/** Centred dialogs: 200 ms in, 140 ms out. */
export const DIALOG_MOTION =
  "transition-[opacity,scale] duration-200 ease-out-strong " +
  "data-[starting-style]:scale-97 data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[ending-style]:duration-140 data-[ending-style]:ease-exit";

/** Dialog backdrops: 180 ms in, 120 ms out. */
export const BACKDROP_MOTION =
  "transition-opacity duration-180 ease-out-strong data-[starting-style]:opacity-0 " +
  "data-[ending-style]:opacity-0 data-[ending-style]:duration-120 data-[ending-style]:ease-exit";

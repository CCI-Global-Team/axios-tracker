/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const getRandomLength = (lengthArray: string[]) => {
  const randomIndex = Math.floor(Math.random() * lengthArray.length);
  return `${lengthArray[randomIndex]}`;
};

// CCI: a fixed pick per slot, so a skeleton keeps its shape across re-renders and remounts instead of reshuffling.
export const pickBySlot = <T,>(options: T[], slot: number): T => options[(slot * 5 + 2) % options.length];

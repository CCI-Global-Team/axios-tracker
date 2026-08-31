/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { EFileAssetType } from "./enums";

export type TFileMetaDataLite = {
  name: string;
  // file size in bytes
  size: number;
  type: string;
};

export type TFileEntityInfo = {
  entity_identifier: string;
  entity_type: EFileAssetType;
};

export type TFileMetaData = TFileMetaDataLite & TFileEntityInfo;

export type TFileSignedURLResponse = {
  asset_id: string;
  asset_url: string;
  upload_data: {
    url: string;
    /**
     * CCI: which HTTP verb the signed URL expects. Cloudflare R2 does not implement the S3 POST
     * Object API, so the backend signs a PUT there and a POST on MinIO/S3. Absent means POST, so
     * an older backend paired with this frontend still behaves as before.
     */
    method?: "POST" | "PUT";
    /** Content-Type the PUT was signed with; the browser must send exactly this or the signature fails. */
    content_type?: string;
    /** Empty on the PUT path — a PUT carries the file as its raw body, with no form fields. */
    fields: {
      "Content-Type"?: string;
      key?: string;
      "x-amz-algorithm"?: string;
      "x-amz-credential"?: string;
      "x-amz-date"?: string;
      policy?: string;
      "x-amz-signature"?: string;
    };
  };
};

export type TDuplicateAssetData = {
  entity_id: string;
  entity_type: EFileAssetType;
  project_id?: string;
  asset_ids: string[];
};

export type TDuplicateAssetResponse = Record<string, string>; // asset_id -> new_asset_id

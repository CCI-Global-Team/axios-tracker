/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosRequestConfig } from "axios";
import axios from "axios";
// services
import { APIService } from "@/services/api.service";

export class FileUploadService extends APIService {
  private cancelSource: any;

  constructor() {
    super("");
  }

  async uploadFile(
    url: string,
    data: FormData | File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<void> {
    this.cancelSource = axios.CancelToken.source();

    // A raw File means the backend signed a PUT rather than an S3 POST policy — Cloudflare R2 does
    // not implement the POST Object API. The body is the file itself and the Content-Type must match
    // what was signed exactly; a mismatch fails the signature check with a 403 rather than a useful
    // error. See generateFileUploadPayload in @plane/services.
    if (data instanceof File) {
      return this.put(url, data, {
        headers: {
          "Content-Type": data.type || "application/octet-stream",
        },
        cancelToken: this.cancelSource.token,
        withCredentials: false,
        onUploadProgress: uploadProgressHandler,
      })
        .then((response) => response?.data)
        .catch((error) => {
          if (axios.isCancel(error)) {
            console.log(error.message);
          } else {
            throw error?.response?.data;
          }
        });
    }

    return this.post(url, data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      cancelToken: this.cancelSource.token,
      withCredentials: false,
      onUploadProgress: uploadProgressHandler,
    })
      .then((response) => response?.data)
      .catch((error) => {
        if (axios.isCancel(error)) {
          console.log(error.message);
        } else {
          throw error?.response?.data;
        }
      });
  }

  cancelUpload() {
    this.cancelSource.cancel("Upload canceled");
  }
}

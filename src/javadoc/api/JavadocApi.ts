import { BehaviorSubject, map } from "rxjs";
import { IS_JAVADOC_EDITOR } from "../../site";

class JavadocApi {
  // The current access token, or null if not authenticated
  accessToken = new BehaviorSubject<string | null>(null);

  needsToLogin = this.accessToken.pipe(map((token) => token == null));

  constructor() {
    this.refreshAccessToken().catch((e) => {
      // Ignore errors on initial load
    });
  }

  async getGithubLoginUrl(): Promise<string> {
    const response = await fetch("/v1/auth/github");

    if (!response.ok) {
      throw new Error("Failed to get GitHub login URL");
    }

    const data = await response.json();
    return data.url;
  }

  async checkStatus(): Promise<boolean> {
    const response = await this.fetchWithAuth("/v1/auth/check");
    return response.status == 200;
  }

  async getJavadoc(version: string, className: string): Promise<JavadocResponse> {
    const requestBody = {
      className,
    };

    const response = await this.fetchWithAuth(`/v1/javadoc/${encodeURIComponent(version)}`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (response.status === 404) {
      // No Javadoc found for this class
      return { data: {} };
    }

    if (!response.ok) {
      throw new Error("Failed to get Javadoc");
    }

    return (await response.json()) as JavadocResponse;
  }

  async updateJavadoc(version: string, update: UpdateJavadocRequest): Promise<void> {
    const response = await this.fetchWithAuth(`/v1/javadoc/${encodeURIComponent(version)}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      throw new Error("Failed to update Javadoc");
    }
  }

  private async fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken.value) {
      throw new Error("Not authenticated");
    }

    options.headers = {
      ...(options.headers as Record<string, string>),
      Authorization: `Bearer ${this.accessToken.value}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(path, options);

    if (response.status == 401) {
      // Token expired, try to refresh
      await this.refreshAccessToken();

      // Retry the request with the new token
      options.headers = {
        ...(options.headers as Record<string, string>),
        Authorization: `Bearer ${this.accessToken.value}`,
        "Content-Type": "application/json",
      };
      return fetch(path, options);
    }

    return response;
  }

  public async refreshAccessToken(): Promise<void> {
    const response = await fetch("/v1/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status == 401) {
      // Unauthorized, need to log in
      this.accessToken.next(null);
      throw new Error("Authentication required");
    } else if (!response.ok) {
      throw new Error("Failed to refresh access token");
    }

    const data = await response.json();
    this.accessToken.next(data.accessToken);
  }
}

export const javadocApi = IS_JAVADOC_EDITOR ? new JavadocApi() : null!;

export interface JavadocResponse {
  data: Record<string, JavadocEntry>;
}

export interface JavadocEntry {
  value: string;
  methods: Record<string, string> | null;
  fields: Record<string, string> | null;
}

export interface UpdateJavadocRequest {
  className: string;
  target: UpdateTarget | null;
  documentation: string;
}

export interface UpdateTarget {
  type: "method" | "field";
  name: string;
  descriptor: string;
}

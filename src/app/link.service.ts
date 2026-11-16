import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ShortLink {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

export interface CreateLinkRequest {
  url: string;
}

export function getLinksApiBaseUrl(location: Pick<Location, 'hostname' | 'port'>): string {
  return location.hostname === 'localhost' && location.port === '4200'
    ? 'http://localhost:3000'
    : '';
}

export const LINKS_API_BASE_URL = new InjectionToken<string>('Links API base URL', {
  providedIn: 'root',
  factory: () => getLinksApiBaseUrl(window.location),
});

@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(LINKS_API_BASE_URL)}/api/links`;

  getLinks(): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(this.endpoint);
  }

  createLink(url: string): Observable<ShortLink> {
    const request: CreateLinkRequest = { url };
    return this.http.post<ShortLink>(this.endpoint, request);
  }
}

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { getLinksApiBaseUrl, LINKS_API_BASE_URL, LinkService } from './link.service';

describe('LinkService API origin', () => {
  let httpTesting: HttpTestingController | undefined;

  it('selects the backend origin only for the localhost:4200 development server', () => {
    expect(getLinksApiBaseUrl({ hostname: 'localhost', port: '4200' })).toBe('http://localhost:3000');
    expect(getLinksApiBaseUrl({ hostname: 'localhost', port: '3000' })).toBe('');
    expect(getLinksApiBaseUrl({ hostname: 'snip.example', port: '4200' })).toBe('');
  });

  it('uses the backend origin when the app is served by Angular on localhost:4200', () => {
    configureApiBaseUrl('http://localhost:3000');

    TestBed.inject(LinkService).getLinks().subscribe();

    const request = httpTesting?.expectOne('http://localhost:3000/api/links');
    expect(request?.request.method).toBe('GET');
    request?.flush([]);
  });

  it('uses the current origin when the app is served by the bundled server', () => {
    configureApiBaseUrl('');

    TestBed.inject(LinkService).getLinks().subscribe();

    const request = httpTesting?.expectOne('/api/links');
    expect(request?.request.method).toBe('GET');
    request?.flush([]);
  });

  afterEach(() => {
    httpTesting?.verify();
    TestBed.resetTestingModule();
  });

  function configureApiBaseUrl(baseUrl: string): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LINKS_API_BASE_URL, useValue: baseUrl },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  }
});

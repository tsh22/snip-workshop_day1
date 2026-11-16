import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ShortLink } from './link.service';

describe('AppComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads the links and renders the short code, original URL, and hit count', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    httpTesting.expectOne('http://localhost:3000/api/links').flush([
      {
        code: 'a1b2c3',
        url: 'https://example.com/a-long-page',
        shortUrl: 'http://localhost:3000/a1b2c3',
        hits: 4,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.textContent).toContain('a1b2c3');
    expect(row.textContent).toContain('https://example.com/a-long-page');
    expect(row.textContent).toContain('4');
  });

  it('rejects non-http URLs without making a create request', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    component.urlControl.setValue('javascript:alert(1)');
    component.submit();
    fixture.detectChanges();

    expect(component.urlControl.errors?.['httpUrl']).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid http or https URL.');
    httpTesting.expectNone({ method: 'POST', url: 'http://localhost:3000/api/links' });
  });

  it('submits a valid URL, displays the result, and refreshes the table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    component.urlControl.setValue('https://example.com');
    component.submit();
    const createRequest = httpTesting.expectOne('http://localhost:3000/api/links');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ url: 'https://example.com' });

    const created: ShortLink = {
      code: 'x7y8z9',
      url: 'https://example.com',
      shortUrl: 'http://localhost:3000/x7y8z9',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    createRequest.flush(created);
    httpTesting.expectOne('http://localhost:3000/api/links').flush([created]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('http://localhost:3000/x7y8z9');
    const shortLink = fixture.nativeElement.querySelector('.short-link') as HTMLAnchorElement;
    expect(shortLink.getAttribute('href')).toBe(created.shortUrl);
    expect(fixture.nativeElement.querySelector('tbody tr')?.textContent).toContain('0');
  });

  it('shows API validation errors next to the URL field', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    component.urlControl.setValue('https://example.com');
    component.submit();
    httpTesting.expectOne('http://localhost:3000/api/links').flush(
      { error: 'The URL is not allowed.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(component.urlControl.errors?.['server']).toBe('The URL is not allowed.');
    expect(fixture.nativeElement.querySelector('#url-error')?.textContent).toContain('The URL is not allowed.');
  });

  it('shows a useful network error when the API cannot be reached', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not reach the Snip API.');
  });
});

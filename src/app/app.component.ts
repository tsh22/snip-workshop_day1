import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { LinkService, ShortLink } from './link.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value).trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly linkService = inject(LinkService);

  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, httpUrlValidator],
  });
  readonly form = new FormGroup({ url: this.urlControl });
  readonly links = signal<ShortLink[]>([]);
  readonly loading = signal(true);
  readonly pending = signal(false);
  readonly listError = signal<string | null>(null);
  readonly requestError = signal<string | null>(null);
  readonly createdLink = signal<ShortLink | null>(null);

  ngOnInit(): void {
    this.loadLinks();
  }

  submit(): void {
    if (this.pending()) {
      return;
    }

    this.urlControl.markAsTouched();
    this.requestError.set(null);
    this.createdLink.set(null);
    this.clearServerError();

    if (this.form.invalid) {
      return;
    }

    this.pending.set(true);
    this.linkService.createLink(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.pending.set(false);
        this.createdLink.set(link);
        this.form.reset();
        this.loadLinks();
      },
      error: (error: unknown) => {
        this.pending.set(false);
        const message = this.getErrorMessage(error);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          this.urlControl.setErrors({ ...this.urlControl.errors, server: message });
          this.urlControl.markAsTouched();
        } else {
          this.requestError.set(message);
        }
      },
    });
  }

  loadLinks(): void {
    this.loading.set(true);
    this.listError.set(null);
    this.linkService.getLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.listError.set(this.getErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  clearMessages(): void {
    this.clearServerError();
    this.requestError.set(null);
    this.createdLink.set(null);
  }

  private clearServerError(): void {
    const errors = this.urlControl.errors;
    if (!errors?.['server']) {
      return;
    }

    const remainingErrors = { ...errors };
    delete remainingErrors['server'];
    this.urlControl.setErrors(Object.keys(remainingErrors).length ? remainingErrors : null);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'object' && error.error !== null && 'error' in error.error
        && typeof error.error.error === 'string') {
        return error.error.error;
      }
      if (error.status === 0) {
        return 'Could not reach the Snip API. Check that the backend is running at http://localhost:3000.';
      }
      return `The API request failed (${error.status}). Please try again.`;
    }

    return 'An unexpected error occurred. Please try again.';
  }
}

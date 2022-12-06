import { TestBed } from '@angular/core/testing';

import { LimitsService } from './limits.service';

describe('LimitsService', () => {
  let service: LimitsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LimitsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

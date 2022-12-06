import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShapeOutlineComponent } from './shape-outline.component';

describe('ShapeOutlineComponent', () => {
  let component: ShapeOutlineComponent;
  let fixture: ComponentFixture<ShapeOutlineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ShapeOutlineComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ShapeOutlineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

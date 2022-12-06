import { EditorActionButton } from './../../PrivateModels';
import { Component, OnInit, Output, Inject, EventEmitter } from '@angular/core';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';

@Component({
  selector: 'app-filter-menu',
  templateUrl: './filter-menu.component.html',
  styleUrls: ['./filter-menu.component.scss']
})
export class FilterMenuComponent{
  filterOptions: Array<EditorActionButton> = [
    {
      name: 'original',
      icon: 'crop_original',
      action: (filter:string) => {
        this.filterSelected.emit(filter);
      },
      text: 'Original'
    },
    {
      name: 'default',
      icon: 'filter_b_and_w',
      action: (filter:string) => {
        this.filterSelected.emit(filter);
      },
      text: 'B&W'
    },
    {
      name: 'bw2',
      icon: 'filter_b_and_w',
      action: (filter:string) => {
        this.filterSelected.emit(filter);
      },
      text: 'B&W 2'
    },
    {
      name: 'bw3',
      icon: 'blur_on',
      action: (filter:string) => {
        this.filterSelected.emit(filter);
      },
      text: 'B&W 3'
    },
    {
      name: 'magic_color',
      icon: 'filter_vintage',
      action: (filter:string) => {
        this.filterSelected.emit(filter);
      },
      text: 'Magic Color'
    },
    
  ];
  @Output() filterSelected: EventEmitter<string> = new EventEmitter();
  selectOption(optionName:string) {
    this.data.filter = optionName;
    this.bottomSheetRef.dismiss();
  }

  constructor(private bottomSheetRef: MatBottomSheetRef<FilterMenuComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: any
  ) { }

}
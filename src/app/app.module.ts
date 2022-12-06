import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NgxDocumentScannerModule } from './modules/ngx-document-scanner/ngx-document-scanner.module';
import { OpenCVConfig } from './modules/ngx-document-scanner/PublicModels';
import { DragDropModule } from '@angular/cdk/drag-drop';
const openCvConfig: OpenCVConfig = {
  openCVDirPath: './assets/opencv'
};

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NgxDocumentScannerModule.forRoot(openCvConfig),
    CommonModule,
    DragDropModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

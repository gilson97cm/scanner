import { FilterMenuComponent } from './../filter-menu/filter-menu.component';
import { NgxOpenCVService } from 'ngx-opencv';
import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { EditorActionButton, PointOptions, PointShape } from '../../PrivateModels';
import { DocScannerConfig, ImageDimensions, OpenCVState } from '../../PublicModels';
import { LimitsService, PointPositionChange, PositionChangeData, RolesArray } from '../../services/limits.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { concatMap, switchMap, tap, map, catchError, filter, mergeMap } from 'rxjs/operators';
import { from } from 'rxjs';

declare var cv: any;

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.scss']
})
export class ImageEditorComponent implements OnInit {

  @Output() exitEditor: EventEmitter<string> = new EventEmitter<string>();
  @Output() editResult: EventEmitter<Blob> = new EventEmitter<Blob>();
  @Output() error: EventEmitter<any> = new EventEmitter<any>();
  @Output() ready: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() processing: EventEmitter<boolean> = new EventEmitter<boolean>();

  @Input() stream_width: number
  @Input() stream_height: number

  @Input() set file(file: File) {
    if (file) {
      setTimeout(() => {
        this.processing.emit(true);
      }, 5);
      var cvState: OpenCVState;
      this.imageLoaded = false;
      this.originalImage = file;
      this.ngxOpenCv.cvState.pipe(
        tap((x:OpenCVState) =>cvState = x),
        switchMap((x:any) =>from(this.getFile(file,cvState)),
       
      ),
      tap((y)=>{
        this.processing.emit(false);
      })

        // async (cvState: OpenCVState) => {
        //   if (cvState.ready) {
        //     // read file to image & canvas
        //     await this.loadFile(file);
        //     this.processing.emit(false);
        //   }

        // }

        ).subscribe()
    }
  }
  @Input() config: DocScannerConfig;

  @ViewChild('PreviewCanvas', { read: ElementRef })
  private previewCanvas: ElementRef = {} as ElementRef

  public async getFile(file:any,cvState:any) {
    try {
      if(cvState.ready){
        return await this.loadFile(file);
      }
    } catch (e) {
      console.error(e);
    }
  }

  public options: ImageEditorConfig = new ImageEditorConfig({})
  public imageDivStyle: { [key: string]: string | number };
  public editorStyle: { [key: string]: string | number };
  public imageLoaded = false;
  public mode: 'crop' | 'color' = 'crop';
  public previewDimensions: ImageDimensions;

  private editorButtons: Array<EditorActionButton> = [
    {
      name: 'exit',
      action: () => {
        this.exitEditor.emit('canceled');
      },
      icon: '#arrow-left',
      type: 'fab',
      mode: 'crop',
      text: 'Exit',
      color: 'danger'
    },
    {
      name: 'rotate',
      action: this.rotateImage.bind(this),
      icon: '#repeat',
      type: 'fab',
      mode: 'crop',
      text: 'Rotate Right',
      color:'primary'
    },
    {
      name: 'done_crop',
      action: async () => {
        this.mode = 'color';
        await this.transform();
        await this.applyFilter(true);
      },
      icon: '#check',
      type: 'fab',
      mode: 'crop',
      text: 'Done',
      color:'primary'
    },
    {
      name: 'back',
      action: () => {
        this.mode = 'crop';
        this.loadFile(this.originalImage);
      },
      icon: '#arrow-left',
      type: 'fab',
      mode: 'color',
      text: 'Back',
      color:'primary'
    },
    // {
    //   name: 'filter',
    //   action: () => {
    //     return this.chooseFilters();
    //   },
    //   icon: '#image',
    //   type: 'fab',
    //   mode: 'color',
    //   text: 'Filter',
    //   color:'primary'
    // },
    {
      name: 'save',
      action: this.exportImage.bind(this),
      icon: '#floppy-o',
      type: 'fab',
      mode: 'color',
      text: 'Save',
      color:'success'
    },
  ];
  private maxPreviewWidth: number;
  private cvState: string = '';
  private selectedFilter = 'original';
  private screenDimensions: ImageDimensions;
  private imageDimensions: ImageDimensions = {
    width: 4096,
    height: 2160
  };
  private imageResizeRatio: number = 0;
  private originalImage: File = {} as File;
  private editedImage: HTMLCanvasElement = {} as HTMLCanvasElement;
  private points: Array<PointPositionChange> = [];

  get displayedButtons() {
    return this.editorButtons.filter(button => {
      return button.mode === this.mode;
    });
  }

  constructor(
    private ngxOpenCv: NgxOpenCVService, 
    private limitsService: LimitsService, 
    private bottomSheet: MatBottomSheet) {
    this.screenDimensions = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // subscribe to status of cv module
    this.ngxOpenCv.cvState.subscribe((cvState: OpenCVState) => {
      this.cvState = cvState.state;
      this.ready.emit(cvState.ready);
      if (cvState.error) {
        this.error.emit(new Error('error loading cv'));
      } else if (cvState.loading) {
        this.processing.emit(true);
      } else if (cvState.ready) {
        this.processing.emit(false);
      }
    });

    // subscribe to positions of crop tool
    this.limitsService.positions.subscribe(points => {
      this.points = points;
    });
  }

  ngOnInit() {
    // set options from config object
    this.options = new ImageEditorConfig(this.config);
    // set export image icon
    this.editorButtons.forEach(button => {
      if (button.name === 'upload') {
        button.icon = this.options.exportImageIcon;
      }
    });
    this.maxPreviewWidth = this.options.maxPreviewWidth;
    this.editorStyle = this.options.editorStyle;
  }

  exit() {
    this.exitEditor.emit('canceled');
  }

  private async exportImage() {
    await this.applyFilter(false);
    if (this.options.maxImageDimensions) {
      this.resize(this.editedImage)
        .then(resizeResult => {
          resizeResult.toBlob((blob: any) => {
            this.editResult.emit(blob);
            this.processing.emit(false);
          }, this.originalImage.type);
        });
    } else {
      this.editedImage.toBlob((blob: any) => {
        this.editResult.emit(blob);
        this.processing.emit(false);
      }, this.originalImage.type);
    }
  }

  private chooseFilters() {
    const data = { filter: this.selectedFilter };
    const bottomSheetRef = this.bottomSheet.open(FilterMenuComponent, {
      data: data
    });
    bottomSheetRef.afterDismissed().subscribe(() => {
      this.selectedFilter = data.filter;
      this.applyFilter(true);
    });

  }


  private loadFile(file: File) {
    return new Promise<void>(async (resolve, reject) => {
      this.processing.emit(true);
      try {
        await this.readImage(file);
      } catch (err:any) {
        console.error(err);
        this.error.emit(new Error(err));
      }
      try {
        await this.showPreview();
      } catch (err:any) {
        console.error(err);
        this.error.emit(new Error(err));
      }
      // set pane limits
      // show points
      this.imageLoaded = true;
      await this.limitsService.setPaneDimensions({ width: this.previewDimensions.width, height: this.previewDimensions.height });
      setTimeout(async () => {
        await this.detectContours();
        this.processing.emit(false);
        resolve();
      }, 15);
    });
  }

  /**
   * read image from File object
   */
  private readImage(file: File) {
    return new Promise<void>(async (resolve, reject) => {
      let imageSrc: any;
      try {
        imageSrc = await readFile();
      } catch (err) {
        reject(err);
      }
      const img = new Image();
      img.onload = async () => {
        // set edited image canvas and dimensions
        this.editedImage = <HTMLCanvasElement>document.createElement('canvas');
        this.editedImage.width = img.width;
        this.editedImage.height = img.height;
        const ctx = this.editedImage.getContext('2d');
        ctx.imageSmoothingEnabled = false
        ctx?.drawImage(img, 0, 0);
        console.log("🚀 ~ editedImage", this.editedImage)
        // resize image if larger than max image size
        const width = img.width > img.height ? img.height : img.width;
        if (width > this.options.maxImageDimensions.width) {
          this.editedImage = await this.resize(this.editedImage);
        }
        this.imageDimensions.width = this.editedImage.width;
        this.imageDimensions.height = this.editedImage.height;
        this.setPreviewPaneDimensions(this.editedImage);
        resolve();
      };
      img.src = imageSrc;
    });

    /**
     * read file from input field
     */
    function readFile() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve(reader.result);
        };
        reader.onerror = (err) => {
          reject(err);
        };
        reader.readAsDataURL(file);
      });
    }
  }

  // ************************ //
  // Image Processing Methods //
  // ************************ //
  /**
   * rotate image 90 degrees
   */
  private rotateImage() {
    return new Promise<void>((resolve, reject) => {
      this.processing.emit(true);
      setTimeout(() => {
        const dst = cv.imread(this.editedImage);
        // const dst = new cv.Mat();
        cv.transpose(dst, dst);
        cv.flip(dst, dst, 1);
        cv.imshow(this.editedImage, dst);
        // src.delete();
        dst.delete();
        // save current preview dimensions and positions
        const initialPreviewDimensions = { width: 0, height: 0 };
        Object.assign(initialPreviewDimensions, this.previewDimensions);
        const initialPositions = Array.from(this.points);
        // get new dimensions
        // set new preview pane dimensions
        this.setPreviewPaneDimensions(this.editedImage);
        // get preview pane resize ratio
        const previewResizeRatios = {
          width: this.previewDimensions.width / initialPreviewDimensions.width,
          height: this.previewDimensions.height / initialPreviewDimensions.height
        };
        // set new preview pane dimensions

        this.limitsService.rotateClockwise(previewResizeRatios, initialPreviewDimensions, initialPositions);
        this.showPreview().then(() => {
          this.processing.emit(false);
          resolve();
        });
      }, 30);
    });


  }


  private detectContours(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.processing.emit(true);
      setTimeout(() => {
        // load the image and compute the ratio of the old height to the new height, clone it, and resize it
        const processingResizeRatio = 0.5;
        const dst = cv.imread(this.editedImage);
        const dsize = new cv.Size(dst.rows * processingResizeRatio, dst.cols * processingResizeRatio);
        const ksize = new cv.Size(5, 5);
        // convert the image to grayscale, blur it, and find edges in the image
        cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(dst, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(dst, dst, 75, 200);
        // find contours
        cv.threshold(dst, dst, 120, 200, cv.THRESH_BINARY);
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(dst, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
        const rect = cv.boundingRect(dst);
        dst.delete(); hierarchy.delete(); contours.delete();
        // transform the rectangle into a set of points
        Object.keys(rect).forEach(key => {
          rect[key] = rect[key] * this.imageResizeRatio;
        });

        const contourCoordinates = [
          new PositionChangeData({ x: rect.x, y: rect.y }, ['left', 'top']),
          new PositionChangeData({ x: rect.x + rect.width, y: rect.y }, ['right', 'top']),
          new PositionChangeData({ x: rect.x + rect.width, y: rect.y + rect.height }, ['right', 'bottom']),
          new PositionChangeData({ x: rect.x, y: rect.y + rect.height }, ['left', 'bottom']),
        ];

        this.limitsService.repositionPoints(contourCoordinates);
        // this.processing.emit(false);
        resolve();
      }, 30);
    });
  }

  private transform(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.processing.emit(true);
      setTimeout(() => {
        const dst = cv.imread(this.editedImage);

        // create source coordinates matrix
        const sourceCoordinates: any = [
          this.getPoint(['top', 'left']),
          this.getPoint(['top', 'right']),
          this.getPoint(['bottom', 'right']),
          this.getPoint(['bottom', 'left'])
        ].map((point: any) => {
          return [point.x / this.imageResizeRatio, point.y / this.imageResizeRatio];
        });

        // get max width
        let p1: any = this.getPoint(['bottom', 'right'])
        let p2: any = this.getPoint(['bottom', 'left'])
        let p3: any = this.getPoint(['top', 'right'])
        let p4: any = this.getPoint(['top', 'left'])
        let p5: any = this.getPoint(['bottom', 'left'])
        let p6: any = this.getPoint(['top', 'left'])
        let p7: any = this.getPoint(['bottom', 'right'])
        let p8: any = this.getPoint(['top', 'right'])
        const bottomWidth = p1.x - p2.x;
        const topWidth = p3.x - p4.x;
        const maxWidth = Math.max(bottomWidth, topWidth) / this.imageResizeRatio;
        // get max height
        const leftHeight = p5.y - p6.y;
        const rightHeight = p7.y - p8.y;
        const maxHeight = Math.max(leftHeight, rightHeight) / this.imageResizeRatio;
        // create dest coordinates matrix
        const destCoordinates: any = [
          [0, 0],
          [maxWidth - 1, 0],
          [maxWidth - 1, maxHeight - 1],
          [0, maxHeight - 1]
        ];

        // convert to open cv matrix objects
        const Ms = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(...sourceCoordinates));
        const Md = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(...destCoordinates));
        const transformMatrix = cv.getPerspectiveTransform(Ms, Md);
        // set new image size
        const dsize = new cv.Size(maxWidth, maxHeight);
        // perform warp
        cv.warpPerspective(dst, dst, transformMatrix, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
        cv.imshow(this.editedImage, dst);

        dst.delete(); Ms.delete(); Md.delete(); transformMatrix.delete();

        this.setPreviewPaneDimensions(this.editedImage);
        this.showPreview().then(() => {
          this.processing.emit(false);
          resolve();
        });
      }, 30);
    });
  }

  private applyFilter(preview: boolean): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.processing.emit(true);
      // default options
      const options = {
        blur: false,
        th: true,
        thMode: cv.ADAPTIVE_THRESH_MEAN_C,
        thMeanCorrection: 10,
        thBlockSize: 25,
        thMax: 255,
        grayScale: true,
      };
      const dst = cv.imread(this.editedImage);

      switch (this.selectedFilter) {
        case 'original':
          options.th = false;
          options.grayScale = false;
          options.blur = false;
          break;
        case 'magic_color':
          options.grayScale = false;
          break;
        case 'bw2':
          options.thMode = cv.ADAPTIVE_THRESH_GAUSSIAN_C;
          options.thMeanCorrection = 15;
          options.thBlockSize = 15;
          break;
        case 'bw3':
          options.blur = true;
          options.thMeanCorrection = 15;
          break;
      }

      setTimeout(async () => {
        if (options.grayScale) {
          cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY, 0);
        }
        if (options.blur) {
          const ksize = new cv.Size(5, 5);
          cv.GaussianBlur(dst, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
        }
        if (options.th) {
          if (options.grayScale) {
            cv.adaptiveThreshold(dst, dst, options.thMax, options.thMode, cv.THRESH_BINARY, options.thBlockSize, options.thMeanCorrection);
          } else {
            dst.convertTo(dst, -1, 1, 60);
            cv.threshold(dst, dst, 170, 255, cv.THRESH_BINARY);
          }
        }
        if (!preview) {
          cv.imshow(this.editedImage, dst);
        }
        await this.showPreview(dst);
        this.processing.emit(false);
        resolve();
      }, 30);
    });
  }

  private resize(image: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      this.processing.emit(true);
      setTimeout(() => {
        const src = cv.imread(image);
        const currentDimensions = {
          width: src.size().width,
          height: src.size().height
        };
        const resizeDimensions = {
          width: 0,
          height: 0
        };
        if (currentDimensions.width > this.options.maxImageDimensions.width) {
          resizeDimensions.width = this.options.maxImageDimensions.width;
          resizeDimensions.height = this.options.maxImageDimensions.width / currentDimensions.width * currentDimensions.height;
          if (resizeDimensions.height > this.options.maxImageDimensions.height) {
            resizeDimensions.height = this.options.maxImageDimensions.height;
            resizeDimensions.width = this.options.maxImageDimensions.height / currentDimensions.height * currentDimensions.width;
          }
          const dsize = new cv.Size(Math.floor(resizeDimensions.width), Math.floor(resizeDimensions.height));
          cv.resize(src, src, dsize, 0, 0, cv.INTER_AREA);
          const resizeResult = <HTMLCanvasElement>document.createElement('canvas');
          cv.imshow(resizeResult, src);
          src.delete();
          this.processing.emit(false);
          resolve(resizeResult);
        } else {
          this.processing.emit(false);
          resolve(image);
        }
      }, 30);
    });
  }

  /**
   * display a preview of the image on the preview canvas
   */
  private showPreview(image?: any) {
    return new Promise<void>((resolve, reject) => {
      let src;
      if (image) {
        src = image;
      } else {
        src = cv.imread(this.editedImage);
      }
      const dst = new cv.Mat();
      const dsize = new cv.Size(0, 0);
      cv.resize(src, dst, dsize, this.imageResizeRatio, this.imageResizeRatio, cv.INTER_AREA);
      cv.imshow(this.previewCanvas.nativeElement, dst);
      src.delete();
      dst.delete();
      resolve();
    });
  }

  private setPreviewPaneDimensions(img: HTMLCanvasElement) {
    // set preview pane dimensions
    this.previewDimensions = this.calculateDimensions(img.width, img.height);
    this.previewCanvas.nativeElement.width = this.previewDimensions.width;
    this.previewCanvas.nativeElement.height = this.previewDimensions.height;
    this.imageResizeRatio = this.previewDimensions.width / img.width;
    this.imageDivStyle = {
      width: this.previewDimensions.width + this.options.cropToolDimensions.width + 'px',
      height: this.previewDimensions.height + this.options.cropToolDimensions.height + 'px',
      'margin-left': `calc((100% - ${this.previewDimensions.width + 10}px) / 2 + ${this.options.cropToolDimensions.width / 2}px)`,
      'margin-right': `calc((100% - ${this.previewDimensions.width + 10}px) / 2 - ${this.options.cropToolDimensions.width / 2}px)`,
    };
    this.limitsService.setPaneDimensions({ width: this.previewDimensions.width, height: this.previewDimensions.height });
  }

  /**
   * calculate dimensions of the preview canvas
   */
  private calculateDimensions(width: number, height: number): { width: number; height: number; ratio: number } {
    const ratio = width / height;

    const maxWidth = this.screenDimensions.width > this.maxPreviewWidth ?
      this.maxPreviewWidth : this.screenDimensions.width - 40;
    const maxHeight = this.screenDimensions.height - 240;
    const calculated = {
      width: maxWidth,
      height: Math.round(maxWidth / ratio),
      ratio: ratio
    };

    if (calculated.height > maxHeight) {
      calculated.height = maxHeight;
      calculated.width = Math.round(maxHeight * ratio);
    }
    return calculated;
  }

  private getPoint(roles: RolesArray) {
    return this.points.find(point => {
      return this.limitsService.compareArray(point.roles, roles);
    });
  }
}


class ImageEditorConfig implements DocScannerConfig {
  maxImageDimensions: ImageDimensions = {
    width: 4096,//800,
    height: 2160//1200
  };

  editorBackgroundColor = '#fefefe';

  editorDimensions: { width: string; height: string; } = {
    width: '100vw',
    height: '100vh'
  };

  extraCss: { [key: string]: string | number } = {
    position: 'absolute',
    top: 0,
    left: 0
  };


  buttonThemeColor: 'primary' | 'warn' | 'accent' = 'accent';

  exportImageIcon = 'cloud_upload';

  cropToolColor = '#3cabe2';

  cropToolShape: PointShape = 'rect';

  cropToolDimensions: ImageDimensions = {
    width: 10,
    height: 10
  };

  pointOptions: PointOptions;

  editorStyle?: { [key: string]: string | number };

  cropToolLineWeight = 3;

  maxPreviewWidth = 4096//800;

  constructor(options: DocScannerConfig) {
    // if (options) {
    //   Object.keys(options).forEach((key) => {
    //     // let k: keyof DocScannerConfig = key
    //     this[key] = options[key];
    //   });
    // }

    this.editorStyle = { 'background-color': this.editorBackgroundColor };
    Object.assign(this.editorStyle, this.editorDimensions);
    Object.assign(this.editorStyle, this.extraCss);

    this.pointOptions = {
      shape: this.cropToolShape,
      color: this.cropToolColor,
      width: 0,
      height: 0
    };
    Object.assign(this.pointOptions, this.cropToolDimensions);
  }
}

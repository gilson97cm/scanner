import { DocScannerConfig } from './modules/ngx-document-scanner/PublicModels';
import { AfterViewInit, Component, ElementRef, ViewChild, EventEmitter, Output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Capture } from './models/Capture';
import { WebcamUtil } from './util/webcam.util';
import { CdkDragDrop, CdkDragEnter, CdkDragMove, moveItemInArray } from '@angular/cdk/drag-drop';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit {

  @Output() exitEditor: EventEmitter<string> = new EventEmitter<string>();

  @ViewChild('video')
  public video: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true })
  private canvas: ElementRef<HTMLCanvasElement>;
  @ViewChild('dropListContainer')
  public dropListContainer: ElementRef;

  public availableVideoInputs: MediaDeviceInfo[];
  public deviceSelected: string | null
  public videoInitialized: boolean;
  public mediaStream: MediaStream | null;
  public activeVideoSettings: MediaTrackSettings | null;
  public activeVideoInputIndex: number;
  public WIDTH: number | undefined;
  public HEIGHT: number | undefined;
  public mirrorImage: string;

  public isEditing: boolean;
  public image: File | null;

  public captureEditing: Capture
  public captureModel: Capture
  public captureList: Capture[];
  public captureListTemp: Capture[];
  public config: DocScannerConfig;

  public dragDropInfo?: {
    dragIndex: number;
    dropIndex: number;
  };

  public dropListReceiverElement?: HTMLElement;

  constructor(private _sanitizer: DomSanitizer) {
    this.video = {} as ElementRef<HTMLVideoElement>
    this.canvas = {} as ElementRef<HTMLCanvasElement>
    this.availableVideoInputs = []
    this.deviceSelected = ''
    this.videoInitialized = false
    this.mediaStream = null;
    this.activeVideoSettings = null
    this.activeVideoInputIndex = -1
    this.WIDTH = 0
    this.HEIGHT = 0
    this.mirrorImage = 'auto'
    this.isEditing = false
    this.image = null
    this.captureEditing = null
    this.captureList = []
    this.captureListTemp = []
    this.config = {
      editorBackgroundColor: '#fefefe',
      buttonThemeColor: 'primary',
      cropToolColor: '#0D94EA',
      cropToolShape: 'rect',
      cropToolDimensions: {
        width: 20,
        height: 20
      },
      cropToolLineWeight: 5,
      exportImageIcon: 'save',
      editorDimensions: {
        width: '99vw',
        height: 'auto'// '82vh'
      },
      extraCss: {
        position: 'flex',
        top: 0,
        left: 0,

      }
    };
  }

  ngAfterViewInit() {
    this.detectAvailableDevices()
      .then(() => {
        this.switchToVideoInput(null);
      })
      .catch((err: string) => {
        console.log(err)
        this.switchToVideoInput(null);
      });
  }

  public ngOnDestroy(): void {
    this.stopMediaTracks();
  }

  public get videoStyleClasses() {
    let classes: string = '';

    if (this.isMirrorImage()) {
      classes += 'mirrored ';
    }
    return classes.trim();
  }

  public get nativeVideoElement() {
    return this.video.nativeElement;
  }

  private getActiveVideoTrack(): MediaStreamTrack {
    return this.mediaStream ? this.mediaStream.getVideoTracks()[0] : null;
  }

  private isMirrorImage(): boolean {
    if (!this.getActiveVideoTrack()) {
      return false;
    }

    // check for explicit mirror override parameter
    {
      let mirror: string = 'auto';
      if (this.mirrorImage) {
        if (typeof this.mirrorImage === 'string') {
          mirror = String(this.mirrorImage).toLowerCase();
        } else {
          // WebcamMirrorProperties
          if (this.mirrorImage) {
            mirror = this.mirrorImage;
          }
        }
      }

      switch (mirror) {
        case 'always':
          return true;
        case 'never':
          return false;
      }
    }

    // default: enable mirroring if webcam is user facing
    return AppComponent.isUserFacing(this.getActiveVideoTrack());
  }

  private static isUserFacing(mediaStreamTrack: MediaStreamTrack): boolean {
    const facingMode: string = AppComponent.getFacingModeFromMediaStreamTrack(mediaStreamTrack);
    return facingMode ? 'user' === facingMode.toLowerCase() : false;
  }

  private static getFacingModeFromMediaStreamTrack(mediaStreamTrack: MediaStreamTrack): string {
    if (mediaStreamTrack) {
      if (mediaStreamTrack.getSettings && mediaStreamTrack.getSettings() && mediaStreamTrack.getSettings().facingMode) {
        return mediaStreamTrack.getSettings().facingMode;
      } else if (mediaStreamTrack.getConstraints && mediaStreamTrack.getConstraints() && mediaStreamTrack.getConstraints().facingMode) {
        const facingModeConstraint: ConstrainDOMString = mediaStreamTrack.getConstraints().facingMode;
        return AppComponent.getValueFromConstrainDOMString(facingModeConstraint);
      }
    }
  }
  private static getValueFromConstrainDOMString(constrainDOMString: ConstrainDOMString): string {
    if (constrainDOMString) {
      if (constrainDOMString instanceof String) {
        return String(constrainDOMString);
      } else if (Array.isArray(constrainDOMString) && Array(constrainDOMString).length > 0) {
        return String(constrainDOMString[0]);
      } else if (typeof constrainDOMString === 'object') {
        // if (constrainDOMString['exact']) {
        //   return String(constrainDOMString['exact']);
        // } else if (constrainDOMString['ideal']) {
        //   return String(constrainDOMString['ideal']);
        // }
      }
    }

    return null;
  }

  public switchToVideoInput(deviceId: string | null): void {
    console.log(" ~ deviceId", deviceId)
    this.videoInitialized = false;
    this.stopMediaTracks();
    this.initWebcam(deviceId);
  }

  private stopMediaTracks() {
    if (this.mediaStream && this.mediaStream.getTracks) {
      // pause video to prevent mobile browser freezes
      this.nativeVideoElement.pause();

      // getTracks() returns all media tracks (video+audio)
      this.mediaStream.getTracks()
        .forEach((track: MediaStreamTrack) => track.stop());
    }
  }

  private initWebcam(deviceId: string) {
    this.deviceSelected = deviceId
    const _video = this.nativeVideoElement
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {

      // merge deviceId -> userVideoTrackConstraints
      // const videoTrackConstraints = WebcamComponent.getMediaConstraintsForDevice(deviceId, userVideoTrackConstraints);

      navigator.mediaDevices.getUserMedia(<MediaStreamConstraints>{
        video: {
          deviceId: deviceId,
          width: { ideal: 1920, },
          height: { ideal: 1080, },
        }
      })
        .then((stream: MediaStream) => {
          this.mediaStream = stream;
          _video.srcObject = stream;
          _video.play();

          this.activeVideoSettings = stream.getVideoTracks()[0].getSettings();
          this.WIDTH = this.activeVideoSettings.width;
          this.HEIGHT = this.activeVideoSettings.height;
          const activeDeviceId: string = deviceId // WebcamComponent.getDeviceIdFromMediaStreamTrack(stream.getVideoTracks()[0]);
          // this.deviceIdWC = activeDeviceId
          // this.cameraSwitched.next(activeDeviceId);
          // Initial detect may run before user gave permissions, returning no deviceIds. This prevents later camera switches. (#47)
          // Run detect once again within getUserMedia callback, to make sure this time we have permissions and get deviceIds.
          this.detectAvailableDevices()
            .then(() => {
              this.activeVideoInputIndex = activeDeviceId ? this.availableVideoInputs
                .findIndex((mediaDeviceInfo: MediaDeviceInfo) => mediaDeviceInfo.deviceId === activeDeviceId) : -1;
              this.videoInitialized = true;
            })
            .catch(() => {
              this.activeVideoInputIndex = -1;
              this.videoInitialized = true;
            });
        })
        .catch((err: DOMException) => {
          console.log("Error: ", err);

        });
    } else {
      console.log('Cannot read UserMedia from MediaDevices.');
    }


  }

  private detectAvailableDevices(): Promise<MediaDeviceInfo[]> {
    return new Promise((resolve, reject) => {
      WebcamUtil.getAvailableVideoInputs()
        .then((devices: MediaDeviceInfo[]) => {
          this.availableVideoInputs = devices;
          resolve(devices);
        })
        .catch(err => {
          this.availableVideoInputs = [];
          reject(err);
        });
    });
  }

  public takeSnapshot(): void {
    // set canvas size to actual video size
    const _video = this.nativeVideoElement;
    const dimensions = { width: this.WIDTH, height: this.HEIGHT };
    if (_video.videoWidth) {
      dimensions.width = _video.videoWidth;
      dimensions.height = _video.videoHeight;
    }


    const _canvas = this.canvas.nativeElement;
    _canvas.height = dimensions.height != undefined ? dimensions.height : 1080;
    _canvas.width = dimensions.width != undefined ? dimensions.width : 1920;
    console.log("🚀 ~ _canvas", _canvas)
    // paint snapshot image to canvas
    const context2d = _canvas.getContext('2d');
    // context2d.drawImage(_video, 0, 0);
    context2d?.drawImage(_video, 0, 0);

    // read canvas content as image
    const mimeType: string = 'image/jpeg';
    const quality: number = 1;
    const dataUrl: string = _canvas.toDataURL(mimeType, quality);
    // console.log("🚀~ dataUrl", dataUrl)

    // get the ImageData object from the canvas' context.
    // let imageData: ImageData|null|undefined = null;

    // if (this.captureImageData) {
    // imageData = context2d?.getImageData(0, 0, _canvas.width, _canvas.height);
    // console.log("🚀 ~ imageData", imageData)
    // }

    // this.imageCapture.next(new WebcamImage(dataUrl, mimeType, imageData));

    //load crop
    let date = new Date().getTime()
    let filename: string = String(date)
    var file = this.dataURLtoFile(dataUrl, `${filename}.jpeg`)
    // this.imageFull = imageBase64
    this.loadFile(file)
  }

  dataURLtoFile(dataUrl: string, filename: string) {
    let arr = dataUrl.split(','),
      mime = "image/jpeg",//arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  loadFile(event: any) {
    // this.processing = true;
    // this.overZone = false;
    const target = event.target as HTMLInputElement
    let f: File;
    if (event instanceof File) {
      f = event;
    } else {
      const files = target.files;
      f = files[0];
    }
    if (this.isImage(f)) {
      this.image = f;
      this.isEditing = true
    }
  }

  isImage(file: File) {
    const types = [
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];
    return types.findIndex(type => {
      return type === file?.type;
    }) !== -1;
  }

  async editResult(result: Blob) {

    let date = new Date().toLocaleTimeString()
    let filename: string = `${date.split(':')[0]}${date.split(':')[1]}${date.split(':')[2]}`
    const img = new Image()
    // let imgFull = this.imageFull
    let captureEditing = this.captureEditing

    img.onload = (event: any) => {
      if (captureEditing == null) {
        this.captureModel = {
          id: filename,
          urlCrop: URL.createObjectURL(result),
          safeUrl: this._sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(result)),
          imageFull: "",//imgFull,
          position: this.captureList.length + 1,
          widthCrop: event.currentTarget.naturalWidth,//this.IS_SAFARI ? event.currentTarget.naturalWidth : event.path[0].naturalWidth,
          heightCrop: event.currentTarget.naturalHeight// this.IS_SAFARI ? event.currentTarget.naturalHeight : event.path[0].naturalHeight
        }

        this.captureList.push(this.captureModel);
      } else {
        this.captureList.forEach(capture => {
          if (capture.id == captureEditing.id) {
            capture.urlCrop = URL.createObjectURL(result);
            capture.safeUrl = this._sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(result));
            capture.widthCrop = event.currentTarget.naturalWidth;
            capture.heightCrop = event.currentTarget.naturalHeight;

          }
        })
      }

    }
    img.src = URL.createObjectURL(result)

    const backBtn = <HTMLButtonElement>document.querySelector('button[name="back"]')
    backBtn.click()
    const exitBtn = <HTMLButtonElement>document.querySelector('button[name="exit"]')
    exitBtn.click()
    this.closeEditor()
    // this.exitEditor.emit('canceled');

    // await this.onDeviceSelectChange(this.deviceSelectedTemp)


  }

  closeEditor(message?: string) {
    this.image = null;
    // this.isCaptured = false;
    // this.urlOriginal = ''
    // this.imageFull = ''
    this.captureEditing = null
    this.isEditing = false;
    this.stopMediaTracks();
    this.switchToVideoInput(this.deviceSelected)

  }

  onError(err: Error) {
    console.error(err);
  }

  editorState(processing?: boolean) {
    // this.processing = null;
    // this.processing = processing;
  }

  dragEntered(event: CdkDragEnter<number>) {
    const drag = event.item;
    const dropList = event.container;
    const dragIndex = drag.data;
    const dropIndex = dropList.data;

    this.dragDropInfo = { dragIndex, dropIndex };
    // console.log('dragEntered', { dragIndex, dropIndex });

    const phContainer = dropList.element.nativeElement;
    const phElement = phContainer.querySelector('.cdk-drag-placeholder');

    if (phElement) {
      phContainer.removeChild(phElement);
      phContainer.parentElement?.insertBefore(phElement, phContainer);

      moveItemInArray(this.captureList, dragIndex, dropIndex);
      this.captureList.map((capture, index) => capture.position = index + 1)

    }
  }

  dragMoved(event: CdkDragMove<number>) {
    if (!this.dropListContainer || !this.dragDropInfo) return;

    const placeholderElement =
      this.dropListContainer.nativeElement.querySelector(
        '.cdk-drag-placeholder'
      );

    const receiverElement =
      this.dragDropInfo.dragIndex > this.dragDropInfo.dropIndex
        ? placeholderElement?.nextElementSibling
        : placeholderElement?.previousElementSibling;

    if (!receiverElement) {
      return;
    }

    receiverElement.style.display = 'none';
    this.dropListReceiverElement = receiverElement;
  }

  dragDropped(event: CdkDragDrop<number>) {
    if (!this.dropListReceiverElement) {
      return;
    }

    this.dropListReceiverElement.style.removeProperty('display');
    this.dropListReceiverElement = undefined;
    this.dragDropInfo = undefined;
  }

  downloadPdf() {
    this.captureListTemp = this.captureList
    let pdf = new jsPDF('l', 'pc', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageRatio = pageWidth / pageHeight;
    for (let i = 0; i < this.captureListTemp.length; i++) {
      let img = new Image();
      setTimeout(() => {
        img.src = String(this.captureListTemp[i].urlCrop);
      }, i * 1000);

      img.onload = async () => {
        const imgWidth = this.captureListTemp[i].widthCrop;
        const imgHeight = this.captureListTemp[i].heightCrop;
        const imgRatio = imgWidth / imgHeight;
        if (i > 0) { await pdf.addPage(); }
        pdf.setPage(i + 1);
        if (imgRatio >= 1) {
          const wc = imgWidth / pageWidth;
          if (imgRatio >= pageRatio) {
            await pdf.addImage(img, 'JPEG', 0, (pageHeight - imgHeight / wc) / 2, pageWidth, imgHeight / wc, null, 'NONE');
          }
          else {
            const pi = pageRatio / imgRatio;
            pdf.addImage(img, 'JPEG', (pageWidth - pageWidth / pi) / 2, 0, pageWidth / pi, (imgHeight / pi) / wc, null, 'NONE');
          }
        }
        else {
          const wc = imgWidth / pageHeight;
          if (1 / imgRatio > pageRatio) {
            const ip = (1 / imgRatio) / pageRatio;
            const margin = (pageHeight - ((imgHeight / ip) / wc)) / 4;
            pdf.addImage(img, 'JPEG', (pageWidth - (imgHeight / ip) / wc) / 2, -(((imgHeight / ip) / wc) + margin), pageHeight / ip, (imgHeight / ip) / wc, null, 'NONE', -90);
          }
          else {

            pdf.addImage(img, 'JPEG', (pageWidth - imgHeight / wc) / 2, -(imgHeight / wc), pageHeight, imgHeight / wc, null, 'NONE', -90);
          }
        }

        if (i == this.captureListTemp.length - 1) {
          let date = new Date().toLocaleTimeString()
          let filename: string = `${date.split(':')[0]}${date.split(':')[1]}${date.split(':')[2]}`
          pdf.save(`${filename}.pdf`);
        }

      }
    }

    this.clearCache()
  }

  clearCache() {
    caches.keys().then((keyList) => {
      Promise.all(keyList.map((key) => caches.delete(key)))
    })
  }
}

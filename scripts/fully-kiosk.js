// Fully Kiosk - TileBoard integration
// Version: 0.0.1
// Based on:
// Floorplan Fully Kiosk for Home Assistant
// Version: 1.0.7.50
// By Petar Kozul
// https://github.com/pkozul/ha-floorplan
// Uses Fully Kiosk JavaScript API:
// https://www.ozerov.de/fully-kiosk-browser/#websiteintegration

'use strict';

( function () {
  if ( typeof window.FullyKiosk === 'function' ) {
    return;
  }

  // FAKE fully for testing in other browsers
  // var fully = {
  //   isFake: true,
  //   getStartUrl: () => "http://www.yomamma.com",
  //   getCurrentLocale: () => "Big TOP, USA",
  //   getIp4Address: () => "192.168.1.161",
  //   getIp6Address: () => "I can't even",
  //   getMacAddress: () => "big mac",
  //   getWifiSsid: () => "DiggerWireless",
  //   getSerialNumber: () => "100",
  //   getDeviceId: () => "My Id",
  //   getBatteryLevel: () => "50",
  //   getScreenBrightness: () => "99",
  //   getScreenOn: () => true,
  //   getWifiSignalLevel: () => "9",
  //   getHostname: () => "fakeHost",
  //   getFullyVersion: () => "0.0.0",
  //   getWebviewVersion: () => "0.0.1",
  //   getAndroidVersion: () => "6.0.0",
  //   getAndroidSdk: () => "SDK1",
  //   getDeviceModel: () => "model1",
  //   isPlugged: () => true,
  //   bind: function( eventName, cb ) {
  //     this[ eventName ] = cb;
  //   }
  // };

  class FullyKiosk {
    constructor( config, api ) {
      this.config = config.fullyKiosk;      
      this.api = api;

      var authToken = config.authToken || api._token;

      this.authInfo = { serverUrl: config.serverUrl, authToken: authToken };

      this.version = '0.0.1';

      this.fullyInfo = {};
      this.fullyState = {};

      this.beacons = {};

      this.throttledFunctions = {};
    }

    /***************************************************************************************************************************/
    /* Initialization
    /***************************************************************************************************************************/

    init() {
      this.logInfo( 'VERSION', `Fully Kiosk for TileBoard v${this.version}` );

      if ( typeof fully === "undefined" ) {
        this.logInfo( 'FULLY_KIOSK', `Fully Kiosk is not running or not enabled. You can enable it in Fully Kiosk via Settings > Other Settings > Enable Website Integration (PLUS).` );
        return;
      }

      if ( !navigator.geolocation ) {
        this.logInfo( 'FULLY_KIOSK', "Geolocation is not supported or not enabled. You can enable it in Fully Kiosk via Settings > Web Content Settings > Enable Geolocation Access (PLUS) and on the device via Google Settings > Location > Fully Kiosk Browser." );
      }

      this.fullyInfo = this.getFullyInfo( this.config );

      this.updateFullyState();
      this.updateCurrentPosition();

      this.initAudio();
      this.addAudioEventHandlers();
      this.addFullyEventHandlers();
      this.subscribeHomeAssistantEvents();

      this.sendMotionState();
      this.sendPluggedState();
      this.sendScreensaverState();
      this.sendMediaPlayerState();
    }

    initAudio() {
      this.audio = new Audio();
      this.isAudioPlaying = false;
    }

    getFullyInfo(device) {
      return {
        motionBinarySensorEntityId: device.motion_sensor,
        pluggedBinarySensorEntityId: device.plugged_sensor,
        screensaverLightEntityId: device.screensaver_light,
        mediaPlayerEntityId: device.media_player,

        locationName: device.presence_detection ? device.presence_detection.location_name : undefined,

        startUrl: fully.getStartUrl(),
        currentLocale: fully.getCurrentLocale(),
        ipAddressv4: fully.getIp4Address(),
        ipAddressv6: fully.getIp6Address(),
        macAddress: fully.getMacAddress(),
        wifiSSID: fully.getWifiSsid(),
        wifiSignalLevel: fully.getWifiSignalLevel(),
        serialNumber: fully.getSerialNumber(),
        deviceId: fully.getDeviceId(),
        hostname: fully.getHostname(),
        fullyVersion: fully.getFullyVersion(),
        webViewVersion: fully.getWebviewVersion(),
        androidVersion: fully.getAndroidVersion(),
        androidSDK: fully.getAndroidSdk(),
        deviceModel: fully.getDeviceModel(),


        isMotionDetected: false,
        isScreensaverOn: false,

        supportsGeolocation: ( navigator.geolocation != undefined ),
      };
    }

    updateFullyState() {
      this.fullyState.batteryLevel = fully.getBatteryLevel();
      this.fullyState.screenBrightness = fully.getScreenBrightness();
      this.fullyState.isScreenOn = fully.getScreenOn();
      this.fullyState.isPluggedIn = fully.isPlugged();
    }

    // INTERESTING FULLY API FUNCTIONALITY THAT WE ARE NOT USING YET
    // void fully.turnScreenOn()
    // void fully.turnScreenOff() 
    // void fully.turnScreenOff(boolean keepAlive) 
    // void fully.forceSleep()           
    // void fully.showToast(String text) 
    // void fully.playVideo(String url, boolean loop, boolean showControls, boolean exitOnTouch, boolean exitOnCompletion)
    // void fully.setAudioVolume(int level, int streamType) 
    // void fully.playSound(String url, boolean loop) 
    // void fully.stopSound()                        
    // void fully.showPdf(String url)
    // void fully.getAudioVolume(int streamType) 
    // void fully.exit()
    // void fully.restartApp()
    // boolean fully.isInForeground()
    // void fully.bringToForeground()
    // String fully.getCamshotJpgBase64()
    // void fully.setStartUrl(String url)      

    /***************************************************************************************************************************/
    /* Set up event handlers
    /***************************************************************************************************************************/

    addAudioEventHandlers() {
      this.audio.addEventListener( 'play', this.onAudioPlay.bind( this ) );
      this.audio.addEventListener( 'playing', this.onAudioPlaying.bind( this ) );
      this.audio.addEventListener( 'pause', this.onAudioPause.bind( this ) );
      this.audio.addEventListener( 'ended', this.onAudioEnded.bind( this ) );
      this.audio.addEventListener( 'volumechange', this.onAudioVolumeChange.bind( this ) );
    }

    addFullyEventHandlers() {
      window[ 'onFullyEvent' ] = ( e ) => { window.dispatchEvent( new Event( e ) ); }

      window[ 'onFullyIBeaconEvent' ] = ( e, uuid, major, minor, distance ) => {
        let event = new CustomEvent( e, {
          detail: { uuid: uuid, major: major, minor: minor, distance: distance, timestamp: new Date() }
        });
        window.dispatchEvent( event );
      }

      window.addEventListener( 'fully.screenOn', this.onScreenOn.bind( this ) );
      window.addEventListener( 'fully.screenOff', this.onScreenOff.bind( this ) );
      window.addEventListener( 'fully.networkDisconnect', this.onNetworkDisconnect.bind( this ) );
      window.addEventListener( 'fully.networkReconnect', this.onNetworkReconnect.bind( this ) );
      window.addEventListener( 'fully.internetDisconnect', this.onInternetDisconnect.bind( this ) );
      window.addEventListener( 'fully.internetReconnect', this.onInternetReconnect.bind( this ) );
      window.addEventListener( 'fully.unplugged', this.onUnplugged.bind( this ) );
      window.addEventListener( 'fully.pluggedAC', this.onPluggedAC.bind( this ) );
      window.addEventListener( 'fully.pluggedUSB', this.onPluggedUSB.bind( this ) );
      window.addEventListener( 'fully.onScreensaverStart', this.onScreensaverStart.bind( this ) );
      window.addEventListener( 'fully.onScreensaverStop', this.onScreensaverStop.bind( this ) );
      window.addEventListener( 'fully.onBatteryLevelChanged', this.onBatteryLevelChanged.bind( this ) );
      window.addEventListener( 'fully.onMotion', this.onMotion.bind( this ) );

      if ( this.fullyInfo.supportsGeolocation ) {
        window.addEventListener( 'fully.onMovement', this.onMovement.bind( this ) );
      }

      if ( this.fullyInfo.locationName ) {
        this.logInfo( 'KIOSK', 'Listening for beacon messages' );
        window.addEventListener( 'fully.onIBeacon', this.onIBeacon.bind( this ) );
      }

      fully.bind( 'screenOn', 'onFullyEvent( "fully.screenOn" );' )
      fully.bind( 'screenOff', 'onFullyEvent( "fully.screenOff" );' )
      fully.bind( 'networkDisconnect', 'onFullyEvent( "fully.networkDisconnect" );')
      fully.bind( 'networkReconnect', 'onFullyEvent( "fully.networkReconnect" );')
      fully.bind( 'internetDisconnect', 'onFullyEvent( "fully.internetDisconnect" );')
      fully.bind( 'internetReconnect', 'onFullyEvent( "fully.internetReconnect" );')
      fully.bind( 'unplugged', 'onFullyEvent( "fully.unplugged" );')
      fully.bind( 'pluggedAC', 'onFullyEvent( "fully.pluggedAC" );')
      fully.bind( 'pluggedUSB', 'onFullyEvent( "fully.pluggedUSB" );')
      fully.bind( 'onScreensaverStart', 'onFullyEvent( "fully.onScreensaverStart" );')
      fully.bind( 'onScreensaverStop', 'onFullyEvent( "fully.onScreensaverStop" );')
      fully.bind( 'onBatteryLevelChanged', 'onFullyEvent( "fully.onBatteryLevelChanged" );')
      fully.bind( 'onMotion', 'onFullyEvent( "fully.onMotion" );') // Max. one per second
      fully.bind( 'onMovement', 'onFullyEvent( "fully.onMovement" );')
      fully.bind( 'onIBeacon', 'onFullyIBeaconEvent( "fully.onIBeacon", "$id1", "$id2", "$id3", $distance );')
    }

    /***************************************************************************************************************************/
    /* Fully Kiosk events
    /***************************************************************************************************************************/

    onScreenOn() {
      this.logDebug( 'FULLY_KIOSK', 'Screen turned on' );
    }

    onScreenOff() {
      this.logDebug( 'FULLY_KIOSK', 'Screen turned off' );
    }

    onNetworkDisconnect() {
      this.logDebug( 'FULLY_KIOSK', 'Network disconnected' );
    }

    onNetworkReconnect() {
      this.logDebug( 'FULLY_KIOSK', 'Network reconnected' );
    }

    onInternetDisconnect() {
      this.logDebug( 'FULLY_KIOSK', 'Internet disconnected' );
    }

    onInternetReconnect() {
      this.logDebug( 'FULLY_KIOSK', 'Internet reconnected' );
    }

    onUnplugged() {
      this.logDebug( 'FULLY_KIOSK', 'Unplugged AC' );
      this.fullyState.isPluggedIn = false;
      this.sendPluggedState();
    }

    onPluggedAC() {
      this.logDebug( 'FULLY_KIOSK', 'Plugged AC' );
      this.fullyState.isPluggedIn = true;
      this.sendPluggedState();
    }

    onPluggedUSB() {
      this.logDebug( 'FULLY_KIOSK', 'Unplugged USB' );
      this.logDebug( 'FULLY_KIOSK', 'Device plugged into USB' );
    }

    onScreensaverStart() {
      this.fullyState.isScreensaverOn = true;
      this.logDebug( 'FULLY_KIOSK', 'Screensaver started' );
      this.sendScreensaverState();
    }

    onScreensaverStop() {
      this.fullyState.isScreensaverOn = false;
      this.logDebug( 'FULLY_KIOSK', 'Screensaver stopped' );
      this.sendScreensaverState();
    }

    onBatteryLevelChanged() {
      this.logDebug( 'FULLY_KIOSK', 'Battery level changed' );
    }

    onMotion() {
      this.fullyState.isMotionDetected = true;
      this.fullyState.lastMotionDetected = new Date().toString();
      // this.fullyState.lastMotionDetectedPicture = fully.getCamshotJpgBase64();
      this.logDebug( 'FULLY_KIOSK', 'Motion detected' );
      this.sendMotionState();
    }

    onMovement( e ) {
      let functionId = 'onMovement';
      let throttledFunc = this.throttledFunctions[ functionId ];
      if ( !throttledFunc ) {
        throttledFunc = this.throttle( this.onMovementThrottled.bind( this ), 10000 );
        this.throttledFunctions[ functionId ] = throttledFunc;
      }

      return throttledFunc( e );
    }

    onMovementThrottled() {
      this.logDebug( 'FULLY_KIOSK', 'Movement detected (throttled)' );

      if ( this.fullyInfo.supportsGeolocation ) {
        this.updateCurrentPosition()
          .then( () => {
            this.sendMotionState();
          } );
      }
    }

    onIBeacon( e ) {
      let functionId = e.detail.uuid;
      let throttledFunc = this.throttledFunctions[ functionId ];
      if ( !throttledFunc ) {
        throttledFunc = this.throttle( this.onIBeaconThrottled.bind( this ), 10000 );
        this.throttledFunctions[ functionId ] = throttledFunc;
      }

      return throttledFunc( e );
    }

    onIBeaconThrottled( e ) {
      let beacon = e.detail;

      this.logDebug( 'FULLY_KIOSK', `Received (throttled) beacon message (${JSON.stringify( beacon )})` );

      let beaconId = beacon.uuid;
      beaconId += ( beacon.major ? `_${beacon.major}` : '' );
      beaconId += ( beacon.minor ? `_${beacon.minor}` : '' );

      this.beacons[ beaconId ] = beacon;

      this.sendBeaconState( beacon );
    }

    /***************************************************************************************************************************/
    /* HTML5 Audio
    /***************************************************************************************************************************/

    onAudioPlay() {
      this.isAudioPlaying = true;
      this.sendMediaPlayerState();
    }

    onAudioPlaying() {
      this.isAudioPlaying = true;
      this.sendMediaPlayerState();
    }

    onAudioPause() {
      this.isAudioPlaying = false;
      this.sendMediaPlayerState();
    }

    onAudioEnded() {
      this.isAudioPlaying = false;
      this.sendMediaPlayerState();
    }

    onAudioVolumeChange() {
      this.sendMediaPlayerState();
    }

    /***************************************************************************************************************************/
    /* Send state to Home Assistant
    /***************************************************************************************************************************/

    sendMotionState() {
      if ( !this.fullyInfo.motionBinarySensorEntityId ) {
        return;
      }

      clearTimeout( this.sendMotionStateTimer );
      let timeout = this.fullyState.isMotionDetected ? 5000 : 10000;

      let state = this.fullyState.isMotionDetected ? "on" : "off";
      this.PostToHomeAssistant( `/api/states/${this.fullyInfo.motionBinarySensorEntityId}`, this.newPayload( state ), () => {
        this.sendMotionStateTimer = setTimeout( () => {
          this.fullyState.isMotionDetected = false;
          this.sendMotionState();

          // Send other states as well
          this.sendPluggedState();
          this.sendScreensaverState();
          this.sendMediaPlayerState();
        }, timeout );
      } );
    }

    sendPluggedState() {
      if ( !this.fullyInfo.pluggedBinarySensorEntityId ) {
        return;
      }

      let state = this.fullyState.isPluggedIn ? "on" : "off";
      this.PostToHomeAssistant( `/api/states/${this.fullyInfo.pluggedBinarySensorEntityId}`, this.newPayload( state ) );
    }

    sendScreensaverState() {
      if ( !this.fullyInfo.screensaverLightEntityId ) {
        return;
      }

      let state = this.fullyState.isScreensaverOn ? "on" : "off";
      this.PostToHomeAssistant( `/api/states/${this.fullyInfo.screensaverLightEntityId}`, this.newPayload( state ) );
    }

    sendMediaPlayerState() {
      if ( !this.fullyInfo.mediaPlayerEntityId ) {
        return;
      }

      let state = this.isAudioPlaying ? "playing" : "idle";
      this.PostToHomeAssistant( `/api/fully_kiosk/media_player/${this.fullyInfo.mediaPlayerEntityId}`, this.newPayload( state ) );
    }

    sendBeaconState( beacon ) {
      if ( !this.fullyInfo.motionBinarySensorEntityId ) {
        return;
      }

      /*
      let payload = {
        name: this.fullyInfo.locationName,
        address: this.fullyInfo.macAddress,
        device: beacon.uuid,
        beaconUUID: beacon.uuid,
        latitude: this.position ? this.position.coords.latitude : undefined,
        longitude: this.position ? this.position.coords.longitude : undefined,
        entry: 1,
      }
      this.PostToHomeAssistant(`/api/geofency`, payload, undefined, false);
      */

      /*
      let payload = {
        mac: undefined,
        dev_id: beacon.uuid.replace(/-/g, '_'),
        host_name: undefined,
        location_name: this.fullyInfo.macAddress,
        gps: this.position ? [this.position.coords.latitude, this.position.coords.longitude] : undefined,
        gps_accuracy: undefined,
        battery: undefined,

        uuid: beacon.uuid,
        major: beacon.major,
        minor: beacon.minor,
      };

      this.PostToHomeAssistant(`/api/services/device_tracker/see`, payload);
      */

      /*
      let fullyId = this.fullyInfo.macAddress.replace(/[:-]/g, "_");
      payload = { topic: `room_presence/${fullyId}`, payload: `{ \"id\": \"${beacon.uuid}\", \"distance\": ${beacon.distance} }` };
      this.config.hass.callService('mqtt', 'publish', payload);
      */

      let deviceId = beacon.uuid.replace(/[-_]/g, '').toUpperCase();

      let payload = {
        room: this.fullyInfo.locationName,
        uuid: beacon.uuid,
        major: beacon.major,
        minor: beacon.minor,
        distance: beacon.distance,
        latitude: this.position ? this.position.coords.latitude : undefined,
        longitude: this.position ? this.position.coords.longitude : undefined,
      };

      this.PostToHomeAssistant( `/api/room_presence/${deviceId}`, payload );
    }

    newPayload( state ) {
      this.updateFullyState();

      let payload = {
        state: state,
        brightness: this.fullyState.screenBrightness,
        attributes: {
          volume_level: this.audio.volume,
          media_content_id: this.audio.src,
          address: this.fullyInfo.ipAddressv4,
          mac_address: this.fullyInfo.macAddress,
          serial_number: this.fullyInfo.serialNumber,
          device_id: this.fullyInfo.deviceId,
          battery_level: this.fullyState.batteryLevel,
          screen_brightness: this.fullyState.screenBrightness,
          currentlocale: this.fullyState.currentLocale,
          startUrl: this.fullyInfo.startUrl,
          wifiSSID: this.fullyInfo.wifiSSID,
          wifiSignalLevel: this.fullyInfo.wifiSignalLevel,
          serialNumber: this.fullyInfo.serialNumber,
          deviceId: this.fullyInfo.deviceId,
          hostname: this.fullyInfo.hostname,
          fullyVersion: this.fullyInfo.fullyVersion,
          webViewVersion: this.fullyInfo.webViewVersion,
          androidVersion: this.fullyInfo.androidVersion,
          androidSDK: this.fullyInfo.androidSDK,
          deviceModel: this.fullyInfo.deviceModel,
          
          _isScreenOn: this.fullyState.isScreenOn,
          _isPluggedIn: this.fullyState.isPluggedIn,
          _isMotionDetected: this.fullyState.isMotionDetected,
          _lastMotionDetected: this.fullyState.lastMotionDetected,
          // _lastMotionDetectedPicture: this.fullyState.lastMotionDetectedPicture,
          _isScreensaverOn: this.fullyState.isScreensaverOn,
          _latitude: this.position && this.position.coords.latitude,
          _longitude: this.position && this.position.coords.longitude,
          _beacons: JSON.stringify( Object.keys( this.beacons ).map( beaconId => this.beacons[ beaconId ] ) )
        }
      };

      return payload;
    }

    /***************************************************************************************************************************/
    /* Geolocation
    /***************************************************************************************************************************/

    setScreenBrightness( brightness ) {
      fully.setScreenBrightness( brightness );
    }

    startScreensaver() {
      this.logInfo( 'FULLY_KIOSK', `Starting screensaver` );
      fully.startScreensaver();
    }

    stopScreensaver() {
      this.logInfo( 'FULLY_KIOSK', `Stopping screensaver` );
      fully.stopScreensaver();
    }

    playTextToSpeech( text ) {
      this.logInfo( 'FULLY_KIOSK', `Playing text-to-speech: ${text}` );
      fully.textToSpeech( text );
    }

    playMedia( mediaUrl ) {
      this.audio.src = mediaUrl;

      this.logInfo( 'FULLY_KIOSK', `Playing media: ${this.audio.src}` );
      this.audio.play();
    }

    pauseMedia() {
      this.logInfo( 'FULLY_KIOSK', `Pausing media: ${this.audio.src}` );
      this.audio.pause();
    }

    setVolume( level ) {
      this.audio.volume = level;
    }

    PostToHomeAssistant( url, payload, onSuccess ) {
      url = this.authInfo.serverUrl + url;
      // console.log( "url", url );
      // console.log( "payload", payload );

      var req = new XMLHttpRequest();
      req.open( "POST", url, true );
      req.setRequestHeader( "Authorization", "Bearer " + this.authInfo.authToken );
      req.setRequestHeader( "Content-Type", "application/json" );      
      req.onreadystatechange = function(){
        if ( this.readyState === XMLHttpRequest.DONE && this.status === 200 ) {
          if ( onSuccess ) {
            onSuccess( JSON.parse(req.response) );
          }
        }        
      };
      req.send( JSON.stringify( payload ) );
    }

    handleMessage ( data ) {
      if( data.type === "event" ) { this.handleEvent( data.event ) }      
      else {
        this.logDebug( "FULLY_KIOSK", "unhandled event type: " + data.type );
      }
    }

    handleEvent ( event ) {
      try {
        if ( event.event_type === "state_changed" || event.event_type === "call_service" ) {
          if ( event.event_type === "state_changed" ) {
            this.logDebug( 'state changed', event.data.entity_id, event.data.new_state );
          } else if ( event.event_type === "call_service" ) {
            this.logDebug( 'service called', event.data.domain, event.data.service, event.data.service_data.entity_id );
          }
          if ( this.fullyInfo.screensaverLightEntityId && ( event.data.domain === 'light' ) ) {
            if ( event.data.service_data.entity_id.toString() === this.fullyInfo.screensaverLightEntityId ) {
              switch ( event.data.service ) {
                case 'turn_on':
                  this.startScreensaver();
                  break;
      
                case 'turn_off':
                  this.stopScreensaver();
                  break;
              }
      
              let brightness = event.data.service_data.brightness;
              if ( brightness ) {
                this.setScreenBrightness( brightness );
              }
            }
          } else if ( this.fullyInfo.mediaPlayerEntityId && ( event.data.domain === 'media_player' ) ) {
            let targetEntityId;
            let serviceEntityId = event.data.service_data.entity_id;
      
            if ( Array.isArray( serviceEntityId ) ) {
              targetEntityId = serviceEntityId.find( entityId => ( entityId === this.fullyInfo.mediaPlayerEntityId ) );
            } else {
              targetEntityId = ( serviceEntityId === this.fullyInfo.mediaPlayerEntityId ) ? serviceEntityId : undefined;
            }
      
            if ( targetEntityId ) {
              switch ( event.data.service ) {
                case 'play_media':
                  this.playMedia( event.data.service_data.media_content_id );
                  break;
      
                case 'media_play':
                  this.playMedia();
                  break;
      
                case 'media_pause':
                case 'media_stop':
                  this.pauseMedia();
                  break;
      
                case 'volume_set':
                  this.setVolume( event.data.service_data.volume_level );
                  break;
      
                default:
                  this.logWarning( 'FULLY_KIOSK', `Service not supported: ${event.data.service}` );
                  break;
              }
            }
          }
      
          if ( ( event.data.domain === 'tts' ) && ( event.data.service === 'google_say' ) ) {
            if ( this.fullyInfo.mediaPlayerEntityId === event.data.service_data.entity_id ) {
              this.logDebug( 'FULLY_KIOSK', 'Playing TTS using Fully Kiosk' );
              this.playTextToSpeech( event.data.service_data.message );
            }
          }
        }            
      }
      catch (e) { this.logError( "FULLY_KIOSK", e ); }
    }  

    subscribeHomeAssistantEvents() { 
      // this.api.subscribeEvents("state_changed", ( res ) => this.logDebug( "subscribed to state_changed", res ) );
      // api is already subscribed to state_changed so we do not need to do that, we'll just listen
      if ( this.api.status === 3 ) {
        this.api.subscribeEvents( "call_service", ( res ) => this.logDebug( "subscribed to call_service", res ) );
        this.api.onMessage( this.handleMessage.bind( this ) );
      } else {
        setTimeout( subscribeHomeAssistantEvents.bind( this ), 1000 );
      }
    }

    /***************************************************************************************************************************/
    /* Geolocation
    /***************************************************************************************************************************/

    updateCurrentPosition() {
      if ( !navigator.geolocation ) {
        return Promise.resolve( undefined );
      }

      return new Promise( ( resolve, reject ) => {
        navigator.geolocation.getCurrentPosition(
          ( position ) => {
            this.logDebug( 'FULLY_KIOSK', `Current location: latitude: ${position.coords.latitude}, longitude: ${position.coords.longitude}` );
            this.position = position;
            resolve( position );
          },
          ( err ) => {
            this.logInfo( 'FULLY_KIOSK', 'Unable to retrieve location' );
            reject( err );
          } );
      } )
    }

    /***************************************************************************************************************************/
    /* Errors / logging
    /***************************************************************************************************************************/

    logError( area, message ) {
      if( CONFIG && !CONFIG.ignoreErrors ) {
        Noty.addObject( {
          type: Noty.ERROR,
          title: 'Error',
          message: area + " " + message,
          lifetime: 10
        } );
      } else { 
        console.error( area, message );        
      }
    }

    logWarning( area, message ) {
      if( CONFIG && !CONFIG.ignoreWarnings ) { 
        Noty.addObject( {
          type: Noty.WARNING,
          title: 'Warning',
          message: area + " " + message,
          lifetime: 10
        } );
      } else {
        console.warn( area, message );          
      }
    }

    logInfo( area, message ) {
      if( CONFIG && !CONFIG.ignoreInfos ) {
        Noty.addObject( {
          type: Noty.INFO,
          title: 'Info',
          message: area + " " + message,
          lifetime: 10
        } );   
      } else {
        console.info( area, message );          
      }
    }

    logDebug( area, message ) {
        console.debug( area, message );
    }

    /***************************************************************************************************************************/
    /* Utility functions
    /***************************************************************************************************************************/

    debounce( func, wait, options ) {
      let lastArgs,
        lastThis,
        maxWait,
        result,
        timerId,
        lastCallTime

      let lastInvokeTime = 0
      let leading = false
      let maxing = false
      let trailing = true

      if ( typeof func != 'function' ) {
        throw new TypeError( 'Expected a function' )
      }
      wait = +wait || 0
      if ( options ) {
        leading = !!options.leading
        maxing = 'maxWait' in options
        maxWait = maxing ? Math.max( +options.maxWait || 0, wait ) : maxWait
        trailing = 'trailing' in options ? !!options.trailing : trailing
      }

      function invokeFunc( time ) {
        const args = lastArgs
        const thisArg = lastThis

        lastArgs = lastThis = undefined
        lastInvokeTime = time
        result = func.apply( thisArg, args )
        return result
      }

      function leadingEdge( time ) {
        // Reset any `maxWait` timer.
        lastInvokeTime = time
        // Start the timer for the trailing edge.
        timerId = setTimeout( timerExpired, wait )
        // Invoke the leading edge.
        return leading ? invokeFunc( time ) : result
      }

      function remainingWait( time ) {
        const timeSinceLastCall = time - lastCallTime
        const timeSinceLastInvoke = time - lastInvokeTime
        const timeWaiting = wait - timeSinceLastCall

        return maxing
          ? Math.min( timeWaiting, maxWait - timeSinceLastInvoke )
          : timeWaiting
      }

      function shouldInvoke( time ) {
        const timeSinceLastCall = time - lastCallTime
        const timeSinceLastInvoke = time - lastInvokeTime

        // Either this is the first call, activity has stopped and we're at the
        // trailing edge, the system time has gone backwards and we're treating
        // it as the trailing edge, or we've hit the `maxWait` limit.
        return ( lastCallTime === undefined || ( timeSinceLastCall >= wait ) ||
          ( timeSinceLastCall < 0 ) || ( maxing && timeSinceLastInvoke >= maxWait ) )
      }

      function timerExpired() {
        const time = Date.now()
        if ( shouldInvoke( time ) ) {
          return trailingEdge( time )
        }
        // Restart the timer.
        timerId = setTimeout( timerExpired, remainingWait( time ) )
      }

      function trailingEdge( time ) {
        timerId = undefined

        // Only invoke if we have `lastArgs` which means `func` has been
        // debounced at least once.
        if ( trailing && lastArgs ) {
          return invokeFunc( time )
        }
        lastArgs = lastThis = undefined
        return result
      }

      function cancel() {
        if ( timerId !== undefined ) {
          clearTimeout( timerId )
        }
        lastInvokeTime = 0
        lastArgs = lastCallTime = lastThis = timerId = undefined
      }

      function flush() {
        return timerId === undefined ? result : trailingEdge( Date.now() )
      }

      function pending() {
        return timerId !== undefined
      }

      function debounced( ...args ) {
        const time = Date.now()
        const isInvoking = shouldInvoke( time )

        lastArgs = args
        lastThis = this
        lastCallTime = time

        if ( isInvoking ) {
          if ( timerId === undefined ) {
            return leadingEdge( lastCallTime )
          }
          if ( maxing ) {
            // Handle invocations in a tight loop.
            timerId = setTimeout( timerExpired, wait )
            return invokeFunc( lastCallTime )
          }
        }
        if ( timerId === undefined ) {
          timerId = setTimeout( timerExpired, wait )
        }
        return result
      }
      debounced.cancel = cancel
      debounced.flush = flush
      debounced.pending = pending
      return debounced
    }

    throttle( func, wait, options ) {
      let leading = true
      let trailing = true

      if ( typeof func != 'function' ) {
        throw new TypeError( 'Expected a function' );
      }
      if ( options ) {
        leading = 'leading' in options ? !!options.leading : leading
        trailing = 'trailing' in options ? !!options.trailing : trailing
      }
      return this.debounce( func, wait, {
        'leading': leading,
        'maxWait': wait,
        'trailing': trailing
      } )
    }
  }

  window.FullyKiosk = FullyKiosk;
} ).call( this );

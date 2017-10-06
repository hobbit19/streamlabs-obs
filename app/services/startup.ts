import { StatefulService, mutation } from './stateful-service';
import { OnboardingService } from './onboarding';
import { ConfigPersistenceService } from './config-persistence';
import { HotkeysService } from './hotkeys';
import { UserService } from './user';
import { ShortcutsService } from './shortcuts';
import { Inject } from '../util/injector';
import electron from 'electron';
import { ServicesManager } from '../services-manager';
import { ScenesTransitionsService } from './scenes-transitions';
import { SourcesService } from './sources';
import { ScenesService } from './scenes/scenes';
import { VideoService } from './video';
import { track } from './usage-statistics';

interface IStartupState {
  loading: boolean;
}

// Performs operations that happen once at startup.  This service
// mainly calls into other services to do the heavy lifting.
export class StartupService extends StatefulService<IStartupState> {

  @Inject()
  onboardingService: OnboardingService;

  @Inject()
  configPersistenceService: ConfigPersistenceService;

  @Inject()
  hotkeysService: HotkeysService;

  @Inject()
  userService: UserService;

  @Inject()
  shortcutsService: ShortcutsService;

  static initialState: IStartupState = {
    loading: true
  };

  private autosaveInterval: number;

  @Inject()
  scenesTransitionsService: ScenesTransitionsService;

  @Inject()
  sourcesService: SourcesService;

  @Inject()
  scenesService: ScenesService;

  @Inject()
  videoService: VideoService;


  @track('app_start')
  load() {
    // This is synchronous and can take a really long time for large configs.
    // Setting a timeout allows the spinner and loading text to be drawn to
    // the screen before starting on the slow synchronous operation.
    // TODO: loading should be async
    setTimeout(() => {
      let loadingPromise: Promise<void>;

      // If we're not showing the onboarding steps, we should load
      // the config file.  Otherwise the onboarding process will
      // handle it based on what the user wants.
      if (!this.onboardingService.startOnboardingIfRequired()) {
        loadingPromise = this.configPersistenceService.load();
      } else {
        loadingPromise = Promise.resolve();
      }

      loadingPromise.then(() => {
        // Set up auto save
        this.autosaveInterval = window.setInterval(() => {
          this.configPersistenceService.save();
        }, 60 * 1000);


        electron.ipcRenderer.on('shutdown', () => this.shutdownHandler());

        this.hotkeysService.bindHotkeys();
        this.userService;
        this.shortcutsService;

        ServicesManager.instance.listenApiCalls();

        this.FINISH_LOADING();
      });
    }, 500);

  }

  @track('app_close')
  private shutdownHandler() {
    clearInterval(this.autosaveInterval);
    this.configPersistenceService.rawSave().then(() => {
      this.videoService.destroyAllDisplays();
      this.scenesTransitionsService.release();
      this.scenesService.scenes.forEach(scene => scene.remove(true));
      this.sourcesService.sources.forEach(source => { if (source.type !== 'scene') source.remove(); });
      electron.remote.getCurrentWindow().close();
    });
  }

  @mutation()
  private FINISH_LOADING() {
    this.state.loading = false;
  }

}
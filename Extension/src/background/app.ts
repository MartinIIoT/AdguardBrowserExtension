/* eslint-disable no-console */
import browser from 'webextension-polyfill';

import { MessageType, sendMessage } from '../common/messages';
import { log } from '../common/log';

import { messageHandler } from './message-handler';
import { ConnectionHandler } from './connection-handler';
import { Engine } from './engine';
import { appStorage, settingsStorage, storage } from './storages';
import {
    toasts,
    CommonFilterApi,
    PagesApi,
    FiltersApi,
    SettingsApi,
    UpdateApi,
    InstallApi,
} from './api';

import {
    UiService,
    PopupService,
    SettingsService,
    FiltersService,
    AllowlistService,
    UserRulesService,
    CustomFilterService,
    FilteringLogService,
    eventService,
    SafebrowsingService,
    DocumentBlockService,
    localeDetect,
    NotificationService,
    filterUpdateService,
} from './services';
import {
    Forward,
    ForwardAction,
    ForwardFrom,
} from '../common/forward';

import { SettingOption } from './schema';
import { getRunInfo } from './utils';
import { CLIENT_ID_KEY } from '../common/constants';

/**
 * App entry point
 */
export class App {
    static uninstallUrl = Forward.get({
        action: ForwardAction.UNINSTALL_EXTENSION,
        from: ForwardFrom.BACKGROUND,
    });

    /**
     * Initializes all app services
     * and handle webextension API events for first install and update scenario
     */
    static async init(): Promise<void> {
        // Initializes connection and message handler as soon as possible
        // to prevent connection errors from extension pages
        ConnectionHandler.init();
        messageHandler.init();

        // get application run info
        const runInfo = await getRunInfo();

        const {
            previousAppVersion,
            currentAppVersion,
        } = runInfo;

        const isAppVersionChanged = previousAppVersion !== currentAppVersion;

        const isInstall = isAppVersionChanged && !previousAppVersion;
        const isUpdate = isAppVersionChanged && !!previousAppVersion;

        if (isInstall) {
            await InstallApi.install(runInfo);
        }

        if (isUpdate) {
            await UpdateApi.update(runInfo);
        }

        /**
         * Initializes App storage data
         */
        await App.initClientId();

        /**
         * Initializes Settings storage data
         */
        await SettingsApi.init();

        /**
         * Initializes Filters data:
         * - Loads app i18n metadata and caches it in i18n-metadata storage
         * - Loads app metadata, apply localization from i18n-metadata storage and caches it in metadata storage
         * - Initializes storages for userrules, allowlist, custom filters metadata and page-stats
         * - Initializes storages for filters state, groups state and filters versions, based on app metadata
         */
        await FiltersApi.init();

        /**
         * initialize filters updates
         */
        await filterUpdateService.init();

        /**
         * Initializes app notifications:
         * - Initializes notifications storage
         * - Adds listeners for notification events
         */
        NotificationService.init();

        // Adds listeners for settings events
        SettingsService.init();

        // Adds listeners for filter and group state events (enabling, updates)
        await FiltersService.init();

        // Adds listeners specified for custom filters
        await CustomFilterService.init();

        // Adds listeners for allowlist events
        await AllowlistService.init();

        // Adds listeners for userrules list events
        await UserRulesService.init();

        // Adds listeners for filtering log
        FilteringLogService.init();

        /**
         * Adds listeners for managing ui
         * (routing between extension pages, toasts, icon update)
         */
        await UiService.init();

        // Adds listeners for popup events
        PopupService.init();

        // Initializes language detector for auto-enabling relevant filters
        localeDetect.init();

        /**
         * Adds listener for creating `notifier` events. Triggers by frontend
         *
         * TODO: delete after frontend refactoring
         */
        eventService.init();

        /**
         * Initializes Safebrowsing module
         * - Initializes persisted lru cache for hashes
         * - Adds listener for filtering web requests
         * - Adds listener for safebrowsing settings option switcher
         * - Adds listener for "add trusted domain" message
         */
        await SafebrowsingService.init();

        /**
         * Initializes Document block module
         * - Initializes persisted cache for trusted domains
         * - Adds listener for "add trusted domain" message
         */
        await DocumentBlockService.init();

        // Sets app uninstall url
        await App.setUninstallUrl();

        // First install additional scenario
        if (isInstall) {
            // Adds engine status listener for filters-download page
            messageHandler.addListener(MessageType.CHECK_REQUEST_FILTER_READY, App.onCheckRequestFilterReady);

            // Opens filters-download page
            await PagesApi.openFiltersDownloadPage();

            // Loads default filters
            await CommonFilterApi.initDefaultFilters();
        }

        // Update additional scenario
        if (isUpdate) {
            if (!settingsStorage.get(SettingOption.DISABLE_SHOW_APP_UPDATED_NOTIFICATION)) {
                toasts.showApplicationUpdatedPopup(currentAppVersion, previousAppVersion);
            }
        }

        // Runs tswebextension
        await Engine.start();

        appStorage.set('isInit', true);

        await sendMessage<MessageType.APP_INITIALIZED>({ type: MessageType.APP_INITIALIZED });
    }

    /**
     * Handles engine status request from filters-download page
     *
     * @returns true, if filter engine is initialized, else false.
     */
    private static onCheckRequestFilterReady(): boolean {
        const ready = Engine.api.isStarted;

        /**
         * If engine is ready, user will be redirected to thankyou page.
         *
         * CHECK_REQUEST_FILTER_READY listener is not needed anymore
         */
        if (ready) {
            messageHandler.removeListener(MessageType.CHECK_REQUEST_FILTER_READY);
        }

        return ready;
    }

    /**
     * Sets app uninstall url
     */
    private static async setUninstallUrl(): Promise<void> {
        try {
            await browser.runtime.setUninstallURL(App.uninstallUrl);
        } catch (e) {
            log.error(`Can't set app uninstall url: ${e.message}`);
        }
    }

    private static async initClientId(): Promise<void> {
        const clientId = await storage.get(CLIENT_ID_KEY);

        if (typeof clientId !== 'string') {
            throw new Error('client id is not found');
        }

        appStorage.set('clientId', clientId);
    }
}

export const app = new App();

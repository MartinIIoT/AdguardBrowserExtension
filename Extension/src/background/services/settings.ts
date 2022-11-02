/**
 * @file
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adguard Browser Extension. If not, see <http://www.gnu.org/licenses/>.
 */
import browser from 'webextension-polyfill';
import { MessageType } from '../../common/messages';
import { SettingOption } from '../schema';
import { messageHandler } from '../message-handler';
import { UserAgent } from '../../common/user-agent';
import { AntiBannerFiltersId } from '../../common/constants';

import { Engine } from '../engine';
import { Categories, SettingsApi, TabsApi } from '../api';
import { listeners } from '../notifier';
import { ContextMenuAction, contextMenuEvents, settingsEvents } from '../events';
import { fullscreenUserRulesEditor } from './fullscreen-user-rules-editor';

export class SettingsService {
    static init() {
        messageHandler.addListener(MessageType.GetOptionsData, SettingsService.getOptionsData);
        messageHandler.addListener(MessageType.ResetSettings, SettingsService.reset);
        messageHandler.addListener(MessageType.ChangeUserSettings, SettingsService.changeUserSettings);
        messageHandler.addListener(MessageType.ApplySettingsJson, SettingsService.import);
        messageHandler.addListener(MessageType.LoadSettingsJson, SettingsService.export);

        settingsEvents.addListener(SettingOption.DisableStealthMode, Engine.update);
        settingsEvents.addListener(SettingOption.HideReferrer, Engine.update);
        settingsEvents.addListener(SettingOption.HideSearchQueries, Engine.update);
        settingsEvents.addListener(SettingOption.SendDoNotTrack, Engine.update);
        settingsEvents.addListener(
            SettingOption.BlockChromeClientData,
            Engine.update,
        );
        settingsEvents.addListener(SettingOption.BlockWebRTC, Engine.update);
        settingsEvents.addListener(
            SettingOption.SelfDestructThirdPartyCookies,
            Engine.update,
        );
        settingsEvents.addListener(
            SettingOption.SelfDestructThirdPartyCookiesTime,
            Engine.update,
        );
        settingsEvents.addListener(
            SettingOption.SelfDestructFirstPartyCookies,
            Engine.update,
        );
        settingsEvents.addListener(
            SettingOption.SelfDestructFirstPartyCookiesTime,
            Engine.update,
        );
        settingsEvents.addListener(
            SettingOption.DisableFiltering,
            SettingsService.onFilteringStateChange,
        );

        contextMenuEvents.addListener(
            ContextMenuAction.EnableProtection,
            SettingsService.enableFiltering,
        );

        contextMenuEvents.addListener(
            ContextMenuAction.DisableProtection,
            SettingsService.disableFiltering,
        );
    }

    static getOptionsData() {
        return {
            settings: SettingsApi.getData(),
            appVersion: browser.runtime.getManifest().version,
            environmentOptions: {
                isChrome: UserAgent.isChrome,
            },
            constants: {
                AntiBannerFiltersId,
            },
            filtersInfo: {
                rulesCount: Engine.api.getRulesCount(),
            },
            filtersMetadata: Categories.getCategories(),
            fullscreenUserRulesEditorIsOpen: fullscreenUserRulesEditor.isOpen(),
        };
    }

    static async changeUserSettings(message) {
        const { key, value } = message.data;
        await SettingsApi.setSetting(key, value);
    }

    static async reset() {
        try {
            await SettingsApi.reset();
            await Engine.update();
            return true;
        } catch (e) {
            return false;
        }
    }

    static async import(message) {
        const { json } = message.data;

        const isImported = await SettingsApi.import(json);

        await Engine.update();

        listeners.notifyListeners(listeners.SettingsUpdated, isImported);
        return isImported;
    }

    static async export() {
        return {
            content: await SettingsApi.export(),
            appVersion: browser.runtime.getManifest().version,
        };
    }

    static async onFilteringStateChange() {
        await Engine.update();

        const activeTab = await TabsApi.getActive();

        if (activeTab) {
            await browser.tabs.reload(activeTab.id);
        }
    }

    static async enableFiltering() {
        await SettingsApi.setSetting(SettingOption.DisableFiltering, false);
    }

    static async disableFiltering() {
        await SettingsApi.setSetting(SettingOption.DisableFiltering, true);
    }
}

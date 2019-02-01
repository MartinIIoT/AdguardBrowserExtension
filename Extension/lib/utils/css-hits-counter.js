/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

var CssHitsCounter = (function () { // jshint ignore:line

    'use strict';

    /**
     * We split CSS hits counting into smaller batches of elements
     * and schedule them one by one using setTimeout
     */
    var COUNT_CSS_HITS_BATCH_DELAY = 5;

    /**
     * Size of small batches of elements we count
     */
    var CSS_HITS_BATCH_SIZE = 25;

    /**
     * In order to find elements hidden by AdGuard we look for a `:content` pseudo-class
     * with values starting with this prefix. Filter information will be encoded in this value as well.
     */
    var CONTENT_ATTR_PREFIX = 'adguard';

    /**
     * We delay countAllCssHits function if it was called too frequently from mutationObserver
     */
    var COUNT_ALL_CSS_HITS_TIMEOUT_MS = 500;

    var onCssHitsFoundCallback;

    /**
     * Unquotes specified value
     */
    function removeQuotes(value) {
        if (typeof value === "string" && value.length > 1 &&
            (value[0] === '"' && value[value.length - 1] === '"'
                || value[0] === '\'' && value[value.length - 1] === '\'')) {
            // Remove double-quotes or single-quotes
            value = value.substring(1, value.length - 1);
        }
        return value;
    }

    /**
     * Adds elements into array if they are not in the array yet
     * @param {*} targetArray
     * @param {*} sourceArray
     */
    function addUnique(targetArray, sourceArray) {
        if (sourceArray.length > 0) {
            for (var i = 0; i < sourceArray.length; i += 1) {
                var sourceElement = sourceArray[i];
                if (targetArray.indexOf(sourceElement) === -1) {
                    targetArray.push(sourceElement);
                }
            }
        }
    }

    /**
     * Serialize HTML element
     * @param element
     */
    function elementToString(element) {
        var s = [];
        s.push('<');
        s.push(element.localName);
        var attributes = element.attributes;
        for (var i = 0; i < attributes.length; i++) {
            var attr = attributes[i];
            s.push(' ');
            s.push(attr.name);
            s.push('="');
            var value = attr.value === null ? '' : attr.value.replace(/"/g, '\\"');
            s.push(value);
            s.push('"');
        }
        s.push('>');
        return s.join('');
    }

    /**
     * Random id generator
     * @param {Number} [length=10] - length of random key
     * @returns {String} - random key with desired length
     */
    function generateRandomKey(length) {
        var DEFAULT_LENGTH = 10;
        length = (typeof length !== 'undefined') ? length : DEFAULT_LENGTH;
        var result = '';
        var possibleValues = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < length; i += 1) {
            result += possibleValues.charAt(Math.floor(Math.random() * possibleValues.length));
        }
        return result;
    }

    /**
     * This storage is used to keep track of counted rules
     * regarding to node elements
     */
    var HitsCounterStorage = {
        counter: 0,
        randomKey: generateRandomKey(),
        isCounted: function (element, rule) {
            var hitAddress = element[this.randomKey];
            if (hitAddress) {
                var countedHit = this[hitAddress];
                if (countedHit) {
                    return countedHit.element === element && countedHit.rule === rule;
                }
            }
            return false;
        },
        setCounted: function (element, rule) {
            var counter = this.getCounter();
            element[this.randomKey] = counter;
            this[counter] = { element: element, rule: rule };
        },
        getCounter: function () {
            this.counter = this.counter + 1;
            return this.counter;
        },
    };

    const parseInfo = (content) => {
        if (!content || content.indexOf(CONTENT_ATTR_PREFIX) < 0) {
            return null;
        }
        let filterIdAndRuleText = decodeURIComponent(content);
        // 'content' value may include open and close quotes.
        filterIdAndRuleText = removeQuotes(filterIdAndRuleText);
        // Remove prefix
        filterIdAndRuleText = filterIdAndRuleText.substring(CONTENT_ATTR_PREFIX.length);
        // Attribute 'content' in css looks like: {content: 'adguard{filterId};{ruleText}'}
        const index = filterIdAndRuleText.indexOf(';');
        if (index < 0) {
            return null;
        }
        const filterId = parseInt(filterIdAndRuleText.substring(0, index), 10);
        const ruleText = filterIdAndRuleText.substring(index + 1);
        return { filterId: filterId, ruleText: ruleText };
    };

    const parseExtendedStyleInfo = (content) => {
        const important = '!important';
        const indexOfImportant = content.indexOf(important);
        if (indexOfImportant === -1) {
            return parseInfo(content);
        }
        const contentWithoutImportant = content.substring(0, indexOfImportant).trim();
        return parseInfo(contentWithoutImportant);
    };

    /**
     * Function checks if elements style content attribute contains data injected with AdGuard
     * @param {Node} element
     * @returns {({filterId: Number, ruleText: String} | null)}
     */
    function getCssHitData(element) {
        if (!(element instanceof Element)) {
            return null;
        }
        const style = getComputedStyle(element);
        if (!style) {
            return null;
        }
        return parseInfo(style.content);
    }

    function countCssHitsForElements(elements, start, length) {
        var RULE_FILTER_SEPARATOR = ';';
        start = start || 0;
        length = length || elements.length;
        var result = [];
        for (var i = start; i < length; i += 1) {
            var element = elements[i];
            var cssHitData = getCssHitData(element);
            if (!cssHitData) {
                continue;
            }
            var filterId = cssHitData.filterId;
            var ruleText = cssHitData.ruleText;
            var ruleAndFilterString = filterId + RULE_FILTER_SEPARATOR + ruleText;
            if (HitsCounterStorage.isCounted(element, ruleAndFilterString)) {
                continue;
            }
            HitsCounterStorage.setCounted(element, ruleAndFilterString);
            result.push({
                filterId: filterId,
                ruleText: ruleText,
                element: elementToString(element),
            });
        }
        return result;
    }

    /**
     * Main calculation function.
     * 1. Select sub collection from elements.
     * 2. For each element from sub collection: retrieve calculated css 'content' attribute and if it contains 'adguard'
     * marker then retrieve rule text and filter identifier.
     * 3. Start next task with some delay.
     *
     * @param elements Collection of all elements
     * @param start Start of batch
     * @param end End of batch
     * @param step Size of batch
     * @param result Collection for save result
     * @param callback Finish callback
     */
    function countCssHitsBatch(elements, start, end, step, result, callback) {
        var length = Math.min(end, elements.length);
        result = result.concat(countCssHitsForElements(elements, start, length));
        if (length === elements.length) {
            callback(result);
            return;
        }
        start = end;
        end += step;
        // Start next task with some delay
        setTimeout(function () {
            countCssHitsBatch(elements, start, end, step, result, callback);
        }, COUNT_CSS_HITS_BATCH_DELAY);
    }

    function removeElements(elements) {
        for (var i = 0; i < elements.length; i += 1) {
            var element = elements[i];
            element.remove();
        }
    }


    var countAllCssHits = (function () {
        // we don't start counting again all css hits till previous count process wasn't finished
        var countIsWorking = false;

        return function () {
            if (countIsWorking) {
                return;
            }
            countIsWorking = true;
            var elements = document.querySelectorAll('*');
            countCssHitsBatch(elements, 0, CSS_HITS_BATCH_SIZE, CSS_HITS_BATCH_SIZE, [], function (result) {
                if (result.length > 0) {
                    onCssHitsFoundCallback(result);
                }
                countIsWorking = false;
            });
        };
    })();

    function startObserver(observer) {
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
        });
    }

    /**
     * Appends node children to the array
     * @param node - element whose children we would like to add
     * @param arrayWithNodes - array where we add children
     */
    function appendChildren(node, arrayWithNodes) {
        const children = node.querySelectorAll('*');
        if (children && children.length > 0) {
            for (let i = 0; i < children.length; i += 1) {
                arrayWithNodes.push(children[i]);
            }
        }
    }

    function countCssHitsForMutations() {
        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
        if (!MutationObserver) {
            return;
        }
        var timeoutId;
        var observer = new MutationObserver(function (mutationRecords) {
            // Collect probe elements, count them, then remove from their targets
            var probeElements = [];
            var childrenOfProbeElements = [];
            var potentialProbeElements = [];
            mutationRecords.forEach(function (mutationRecord) {
                if (mutationRecord.addedNodes.length === 0) {
                    return;
                }
                for (var i = 0; i < mutationRecord.addedNodes.length; i += 1) {
                    var node = mutationRecord.addedNodes[i];
                    var target = mutationRecord.target;
                    if (!node.parentNode && target && node instanceof Element) {
                        // Most likely this is a "probe" element that was added and then immediately removed from DOM.
                        // We re-add it and check if any rule matched it
                        probeElements.push(node);

                        // CSS rules could be applied to the nodes inside probe element
                        // that's why we get all child elements of added node
                        appendChildren(node, childrenOfProbeElements);

                        observer.disconnect();
                        mutationRecord.target.appendChild(node);
                    } else if (node.parentNode && target && node instanceof Element) {
                        // Sometimes probe elements are appended to the DOM
                        potentialProbeElements.push(node);
                        appendChildren(node, potentialProbeElements);
                    }
                }
            });

            // If the list of potential probe elements is relatively small, we can count CSS hits immediately
            if (potentialProbeElements.length > 0 && potentialProbeElements.length <= CSS_HITS_BATCH_SIZE) {
                let result = countCssHitsForElements(potentialProbeElements);
                if (result.length > 0) {
                    onCssHitsFoundCallback(result);
                }
            }

            var allProbeElements = [];

            addUnique(allProbeElements, childrenOfProbeElements);
            addUnique(allProbeElements, probeElements);

            if (allProbeElements.length > 0) {
                var result = countCssHitsForElements(allProbeElements);
                if (result.length > 0) {
                    onCssHitsFoundCallback(result);
                }
                /**
                 * don't remove child elements of probe elements
                 * https://github.com/AdguardTeam/AdguardBrowserExtension/issues/1096
                 */
                removeElements(probeElements);
                startObserver(observer);
            }

            // debounce counting all css hits when mutation record fires
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(function () {
                countAllCssHits();
                clearTimeout(timeoutId);
            }, COUNT_ALL_CSS_HITS_TIMEOUT_MS);
        });
        startObserver(observer);
    }

    function countCssHits() {
        countAllCssHits();
        countCssHitsForMutations();
    }

    /**
     * Callback used to collect statistics of elements affected by extended css rules
     * @param affectedEl
     */
    const countAffectedByExtendedCss = (affectedEl) => {
        if (typeof onCssHitsFoundCallback !== 'function') {
            return;
        }
        if (affectedEl && affectedEl.rule && affectedEl.rule.style && affectedEl.rule.style.content) {
            const { filterId, ruleText } = parseExtendedStyleInfo(affectedEl.rule.style.content);
            const result = {
                filterId,
                ruleText,
                element: elementToString(affectedEl.node),
            };
            onCssHitsFoundCallback([result]);
        }
    };

    /**
     * This callback is called on css hits detection
     * @callback cssHitsCounterCallback
     * @param {{filterId: Number, ruleText: String, element: String}[]} stats
     */

    /**
     * This function prepares calculation of css hits.
     * We are waiting for 'load' event and start calculation.
     * @param {cssHitsCounterCallback} callback - handles counted css hits
     */
    var init = function (callback) {
        if (typeof callback !== 'function') {
            throw new Error('AdGuard Extension: "callback" parameter is not a function');
        }
        onCssHitsFoundCallback = callback;

        function startCounter() {
            if (document.readyState === 'interactive' ||
                document.readyState === 'complete') {
                countCssHits();
                document.removeEventListener('readystatechange', startCounter);
            }
        }

        if (document.readyState === 'complete' ||
            document.readyState === 'interactive') {
            countCssHits();
        } else {
            document.addEventListener('readystatechange', startCounter);
        }
    };

    return {
        init: init,
        countAffectedByExtendedCss: countAffectedByExtendedCss,
    };
})();

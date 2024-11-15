(function() {
    function storageAvailable(type) {
        if (type == 'queryStorage' || type == 'fragmentStorage' || type == 'cookieStorage' || type == 'httpStorage') {
            return true;
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
        let storage;
        try {
          storage = window[type];
          const x = "__storage_test__";
          storage.setItem(x, x);
          storage.removeItem(x);
          return true;
        } catch (e) {
          return (
            e instanceof DOMException &&
            // everything except Firefox
            (e.code === 22 ||
              // Firefox
              e.code === 1014 ||
              // test name field too, because code might not be present
              // everything except Firefox
              e.name === "QuotaExceededError" ||
              // Firefox
              e.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
            // acknowledge QuotaExceededError only if there's something already stored
            storage &&
            storage.length !== 0
          );
        }
    }

    function log(msg) {
        if (debug && console.log) {
            console.log(new Date().toISOString(), msg);
        }
    }

    // Unescape some useless escapes to make url cleaner
    function urlParamsToString(params) {
        return (params === undefined  ? '' :
                Array.isArray(params) ? params.join('')
                                      : params.toString())
            .replaceAll('%2C',',')
            .replaceAll('%3A',':')
            .replaceAll('%2F','/');
    }

    function distinct(value, index, array) {
        return array.indexOf(value) === index;
    }

    function isCheckable(elem) {
        return elem.type === 'checkbox' || elem.type === 'radio';
    }

    function allForName(scope, name) {
        let self = name == scope.getAttribute('name') || name == scope.getAttribute('persist-fields-name') ? [scope] : [];
        return self.concat([...scope.querySelectorAll('[name="'+name+'"'), ...scope.querySelectorAll('[persist-fields-name="'+name+'"]')]);
    }

    // Returns the current value of the given element.
    function currentValue(elem) {
        return isCheckable(elem)                                       ? [elem.checked] :
               elem.tagName === 'SELECT'                               ? [...elem.selectedOptions].map(x => x.value) :
               elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA' ? [elem.value] :
                                                                         [elem.innerText];
    }

    // Returns the default value of the given element.
    function defaultValue(elem) {
        return isCheckable(elem)                                       ? [elem.defaultChecked] :
               elem.tagName === 'SELECT'                               ? [...elem.options].filter(x => x.defaultSelected).map(x => x.value) :
               elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA' ? [elem.defaultValue] :
                                                                         [elem.innerText];
    }

    // Values/defaults for all fields named 'name'
    function resolve(scope, name, f) {
        let all = allForName(scope, name).filter(x => !x.closest(':disabled'));
        let checkables = all.filter(isCheckable).filter(x => f(x)[0]).map(x => x.value).join(",");
        let others = all.filter(x => !isCheckable(x));
        for (let i = others.length-1; i >= 0; i--) {
            if (JSON.stringify(f(others[i])) === '[""]' || // values is empty, or...
                    others[i].hasAttribute('readonly') &&
                    !others[i].hasAttribute('required') && (
                        i > 0 && JSON.stringify(f(others[i-1])) === '[""]' || // readonly-optional and previous value is empty, or...
                        i == others.length-1) // readonly-optional as last element
                    ) {
                others.splice(i, 1);
            }
        }
        return [checkables].filter(x => x != '').concat(others.map(f));
    }

    // Returns all input descendants (including self) of the given element, which are not ignored by hx-ext="ignore:persist-fields".
    function getFields(elem) {
        if (["INPUT","TEXTAREA","SELECT"].includes(elem.tagName) && elem.hasAttribute('name') ||
                elem.hasAttribute('persist-fields-name')) {
            return [elem];
        } else {
            var fields = []
            elem.querySelectorAll("input[name], textarea[name], select[name], [persist-fields-name]").forEach(x => {
                api.withExtensions(x, function (ext) {
                    if (ext._ext_persist_fields) {
                        fields.push(x);
                    }
                });
            });
            return fields;
        }
    }

    function readQueryOrFragment(storageKey, separator, data) {
        if (typeof storageKey === 'number') {
            var values = (data.trim().length == 0 ? [] : data.split(separator)).map(decodeURIComponent);
            return storageKey < values.length ? [values[storageKey]] : undefined;
        } else if (typeof storageKey === 'string') {
            let params = new URLSearchParams(data);
            let ret = params.has(storageKey) ? params.getAll(storageKey) : undefined;
            return Array.isArray(ret) && ret.length == 1 && ret[0] === "" ? [] : ret;
        } else {
            throw new Error("Invalid storageKey");
        }
    }

    // Read the value under 'index' from 'storage'.
    function readStorage(storage, storageKey, callback) {
        log("readStorage(" + storage + ", " + storageKey + ", " + callback + ")");
        if (storage == 'query') {
            callback(readQueryOrFragment(storageKey, '&', window.location.search.substring(1)));
        } else if (storage == 'fragment') {
            callback(readQueryOrFragment(storageKey, '#', window.location.hash.substring(1)));
        } else if (storage == 'cookie') {
            let params = document.cookie
                                 .split("; ")
                                 .filter(x => x.length > 0)
                                 .map(x => {
                                    let parts = x.split("=");
                                    let ret = {};
                                    ret[parts[0]] = parts[1] === undefined ? undefined : decodeURIComponent(parts[1]).split(',');
                                    return ret;
                                 }).reduce(((r, c) => Object.assign(r, c)), {});
            callback(storageKey ? (params[storageKey] ? params[storageKey] : undefined) : document.cookie.length == 0 ? undefined : params);
        } else if (storage == 'session') {
            callback(JSON.parse(sessionStorage.getItem(storageKey)) || {});
        } else if (storage == 'local') {
            callback(JSON.parse(localStorage.getItem(storageKey)) || {});
        } else if (storage == 'http') {
            let req = new XMLHttpRequest();
            req.open("GET", storageKey);
            req.onload = () => {
                callback(JSON.parse(req.responseText));
            };
            req.send();
        }
    }

    function modifyQueryOrFragment(storageKey, separator, data, contents) {
        if (typeof storageKey === 'number') {
            const values = data.substring(1).split(separator);
            while (values.length <= storageKey) {
                values.push('');
            }
            values[storageKey] = urlParamsToString(contents);
            return values.join(separator).replace(new RegExp(separator + "+$"), '');
        } else {
            let params = new URLSearchParams(data.substring(1));
            params.delete(storageKey);
            if (contents === undefined) {
                // keep deleted
            } else if (contents.length == 0) {
                params.append(storageKey, "");
            } else {
                contents.forEach(x => Array.isArray(x) ? x.forEach(y => params.append(storageKey, urlParamsToString(y))) : params.append(storageKey, urlParamsToString(x)));
            }
            return urlParamsToString(params);
        }
    }

    // Save 'contents' to 'storage'.
    function saveStorage(storage, contents, storageKey, cookieOptions) {
        log("saveStorage(" + storage + ", " + contents + ", " + storageKey + ", " + cookieOptions + ")");
        if (storage === 'query') {
            let data = modifyQueryOrFragment(storageKey, '&', window.location.search, contents);
            if (data !== window.location.search.substring(1)) {
                history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname + '?' + data + window.location.hash);
            }
        } else if (storage === 'fragment') {
            let data = modifyQueryOrFragment(storageKey, '#', window.location.hash, contents);
            if (data !== window.location.hash.substring(1)) {
                history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + '#' + data);
            }
        } else if (storage === 'cookie') {
            if (contents) {
                document.cookie = storageKey + '=' + encodeURIComponent(contents.join(',')) + ';' + cookieOptions;
            } else {
                document.cookie = storageKey + '=;max-age=0'; // delete cookie
            }
        } else if (storage === 'session') {
            if (contents === undefined) {
                sessionStorage.removeItem(storageKey);
            } else {
                sessionStorage.setItem(storageKey, JSON.stringify(contents));
            }
        } else if (storage === 'local') {
            if (contents === undefined) {
                localStorage.removeItem(storageKey);
            } else {
                localStorage.setItem(storageKey, JSON.stringify(contents));
            }
        } else if (storage === 'http') {
            let req = new XMLHttpRequest();
            if (contents === undefined) {
                req.open("DELETE", storageKey);
                req.send();
            } else {
                req.open("PUT", storageKey);
                req.send(JSON.stringify(contents));
            }
        }
    }

    function deleteContent(name, contents) {
        if (contents) {
            if (contents.delete) {
                contents.delete(name);
            } else if (contents[name] !== undefined) {
                delete contents[name];
            }
        }
        return contents;
    }

    // Restore the default values for all fields under 'persistScope'
    function clear(storage, persistScope, storageKey) {
        log("clear(" + storage + ", " + persistScope + ", " + storageKey + ")");
        readStorage(storage, storageKey, () => {
            if (persistScope) {
                persistScope.querySelectorAll('[data-persist-fields-initialized]').forEach(x => {
                    // set value to stored default
                    if (isCheckable(x)) {
                        x.checked = x.getAttribute('data-persist-fields-initialized') === 'true';
                    } else {
                        x.value = x.getAttribute('data-persist-fields-initialized');
                    }
                });
            }
            saveStorage(storage, undefined, storageKey);
        });
    }

    function doSelect(child, val) {
        child.selectedIndex = -1;
        [...child.options].filter(x => x.value).forEach(x => {
            let newval = val.includes(x.value);
            if (newval && !child.multiple && [...child.selectedOptions].filter(x => x.value).length > 0) {
                child.multiple = true;
            }
            if (x.selected !== newval) {
                log("Changing " + x.value + " of " + (child.id || child.name) + " to " + newval);
                x.selected = newval;
            }
        });
        if ([...child.selectedOptions].filter(x => x.value).length == 0) {
            log("Selecting defaults of " + (child.id || child.name));
            [...child.selectedOptions].filter(x => x.defaultSelected).filter(o => !o.selected).forEach(o => o.selected = true);
        }
    }

    function setValue(scope, child, name, values) {
        log("setValue(" + scope + ", " + child + ", " + name + ", " + values + ")");
        if (values !== undefined) {
            if (isCheckable(child)) {
                child.checked = values.flatMap(x => x.split(",")).includes(child.value);
            } else {
                let all = allForName(scope, name);
                if (all.length === 1) {
                    if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA') {
                        child.value = values.join('');
                    } else if (child.tagName === 'SELECT') {
                        let val = (Array.isArray(values) ? values : [values]).flatMap(x => x.split(","));
                        doSelect(child, val);
                    } else {
                        child.innerText = values.join('');
                    }
                } else {
                    // multiple fields with the same name -> set value only for the field at the correct position
                    let position = all.indexOf(child);
                    let value = getValueAtPosition(all, values, position);
                    if (value !== undefined) {
                        if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA') {
                            child.value = value;
                        } else if (child.tagName === 'SELECT') {
                            let val = Array.isArray(value) ? value : [value];
                            doSelect(child, val);
                        } else {
                            child.innerText = value;
                        }
                    }
                }
            }
        }
    }

    function matchConstant(remaining, field) {
        if (field.hasAttribute('readonly')) {
            if (remaining.startsWith(field.getAttribute('value'))) {
                let currentPart = field.getAttribute('value');
                return [currentPart, remaining.substring(currentPart.length)];
            }
        }
        return undefined;
    }

    function matchConstantLength(remaining, field) {
        if (field.hasAttribute('minlength') && field.getAttribute('minlength') === field.getAttribute('maxlength')) {
            let currentPart = remaining.substring(0, parseInt(field.getAttribute('minlength')));
            return [currentPart, remaining.substring(currentPart.length)];
        }
        return undefined;
    }

    function doMatchPattern(pattern, remaining, results, maxResults) {
        let matchResult = remaining.match(pattern);
        if (results.length < maxResults && matchResult !== null && matchResult[0].length > 0) {
            let currentPart = matchResult.length > 1 ? matchResult[1] : matchResult[0];
            return doMatchPattern(pattern, remaining.substring(matchResult[0].length), [...results, currentPart], maxResults);
        }
        return [results, remaining];
    }
    
    function matchPattern(remaining, field) {
        if (field.hasAttribute('pattern')) {
            let pattern = field.getAttribute('pattern');
            let results = doMatchPattern(new RegExp(pattern.startsWith('^') ? pattern : '^' + pattern), remaining, [], 1);
            if (results[0].length > 0) {
                return results[0].length >= 1 ? [results[0][0], results[1]] : results;
            }
        }
        return undefined;
    }

    function matchDateTime(remaining, field) {
        if (field.getAttribute('type') === 'datetime-local') {
            let matchResult = remaining.match(/^[0-9]{1,4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}/);
            if (matchResult !== null) {
                let currentPart = matchResult[0];
                return [currentPart, remaining.substring(currentPart.length)];
            }
        }
        return undefined;
    }

    function matchDate(remaining, field) {
        if (field.getAttribute('type') === 'date') {
            let matchResult = remaining.match(/^[0-9]{1,4}-[0-9]{2}-[0-9]{2}/);
            if (matchResult !== null) {
                let currentPart = matchResult[0];
                return [currentPart, remaining.substring(currentPart.length)];
            }
        }
        return undefined;
    }

    function matchTime(remaining, field) {
        if (field.getAttribute('type') === 'time') {
            // time
            let matchResult = remaining.match(/^[0-9]{2}:[0-9]{2}(:[0-9]{2})?/);
            if (matchResult !== null) {
                let currentPart = matchResult[0];
                return [currentPart, remaining.substring(currentPart.length)];
            }
        }
        return undefined;
    }

    function matchSelect(remaining, field) {
        if (field.tagName === 'SELECT') {
            let found = [...field.options].map(x => x.value)
                                          .filter(x => x !== '')
                                          .filter(x => remaining.startsWith(x))
                                          .sort((a, b) => b.length - a.length)
                                          .find(x => true);
            if (found) {
                return [found, remaining.substring(found.length)];
            }
        }
        return undefined;
    }

    function doMatchMultiselect(field, remaining, results) {
        let found = [...field.options].map(x => x.value)
                                      .filter(x => x !== '')
                                      .filter(x => remaining.startsWith(x))
                                      .sort((a, b) => b.length - a.length)
                                      .find(x => true);
        if (found) {
            let rem = remaining.substring(found.length);
            if (rem.startsWith(',')) {
                return doMatchMultiselect(field, rem.substring(1), [...results, found]);
            }
            return [[...results, found], rem];
        }
        return [results, remaining];
    }

    function matchMultiselect(remaining, field) {
        if (field.tagName === 'SELECT' && field.multiple) {
            let results = doMatchMultiselect(field, remaining, []);
            if (results[0].length > 0) {
                return results;
            }
        }
        return undefined;
    }

    function matchRest(remaining, field) {
        if ((field.tagName === 'TEXTAREA' || field.tagName === 'INPUT' && ['text', 'hidden'].includes(field.type)) &&
            (!field.hasAttribute('minlength') || parseInt(field.getAttribute('minlength')) <= remaining.length) &&
            (!field.hasAttribute('maxlength') || parseInt(field.getAttribute('maxlength')) >= remaining.length)) {
        
            return [remaining, ''];
        }
        return undefined;
    }

    function matchField(remaining, field) {
        for (let i in fieldMatchers) {
            let ret = fieldMatchers[i](remaining, field);
            if (ret !== undefined) {
                log("Matched " + ret[0] + " of " + remaining + " in " + (field.id || field.name) +  " with matcher " + fieldMatchers[i].name);
                return ret;
            }
        }
        return [undefined, remaining];
    }

    function getValueAtPosition(all, values, position) {
        if (values.length == 0) {
            return '';
        } else if (values.length > 1) {
            return values[position];
        } else {
            let [currentPart,_] = all.slice(0, position+1)
                                     .reduce(([_,remaining], field) => matchField(remaining, field), [undefined, values[0]]);
            return currentPart;
        }
    }

    function getName(field) {
        return field.getAttribute('name') || field.getAttribute('persist-fields-name');
    }

    function getStorageKey(storage, name, indexOrCookieOptions) {
        return storage === 'cookie'                ? name :                 // cookies can only by keyed by field name.
               storage === 'http'                  ? indexOrCookieOptions :
               indexOrCookieOptions !== undefined  ? indexOrCookieOptions : // if using localStore/sessionStore or indexed storage, use the index
                                                     name;
    }

    function handleStorage(scope, storage, field, indexOrCookieOptions) {
        let name = getName(field);
        let storageKey = getStorageKey(storage, name, indexOrCookieOptions);
        let structured = storage === 'local' || storage === 'session' || storage === 'http';

        // have to read defaults on initialization since browsers change them when value is changed programmatically
        let defaults = resolve(scope, name, defaultValue);

        // initialize the field with the value from storage.
        if (field.hasAttribute('readonly') && !isCheckable(field) && field.defaultValue) {
            // don't try to initialize read-only non-checkable fields with a default value
        } else {
            readStorage(storage, storageKey, currentValues => {
                setValue(scope, field, name, structured ? currentValues[name] : currentValues);
            });
        }
        // storage modified elsewhere, reflect the change to this field
        window.addEventListener('htmx:persistFieldsSave', e => {
            if (e.detail.scope !== scope) {
                readStorage(storage, storageKey, currentValues => {
                    setValue(scope, field, name, structured ? currentValues[name] : currentValues);
                });
            }
        });

        // mark element as initialized, to prevent multiple initializations, and to store original value
        field.setAttribute("data-persist-fields-initialized", defaultValue(field));

        // must process before adding triggers, otherwise Htmx will deinit the element clearing listeners
        htmx.process(field);

        if (!field.hasAttribute('readonly')) {
            api.getTriggerSpecs(field).forEach(triggerSpec => {
                let nodeData = api.getInternalData(field);
                api.addTriggerHandler(field, triggerSpec, nodeData, (elt, evt) => {
                    if (htmx.closest(elt, htmx.config.disableSelector)) {
                        return;
                    }
                    let newValues = resolve(scope, name, currentValue);
                    readStorage(storage, storageKey, current => {
                        let cur = structured ? deleteContent(name, current) : undefined;
                        if (JSON.stringify(newValues) != JSON.stringify(defaults) || field.required) {
                            if (cur && !Array.isArray(cur)) {
                                cur[name] = structured ? newValues.flat() : newValues;
                            } else {
                                cur = newValues;
                            }
                        }

                        saveStorage(storage, cur, storageKey, indexOrCookieOptions);
                        window.dispatchEvent(new CustomEvent('htmx:persistFieldsSave', {detail: {scope: scope, storage: storage}}));
                    });
                });
            });
        }
    }

    let storages = ['session', 'local', 'query', 'fragment', 'cookie', 'http'];
    let availableStorages = storages.filter(x => storageAvailable(x + 'Storage'));
    let selectors = availableStorages.map(x => '[persist-fields-' + x + ']').join(',');

    var api;
    var fieldMatchers;
    var debug = false;

    htmx.defineExtension('persist-fields', {
        _ext_persist_fields: true,

        init: function (internalAPI) {
            api = internalAPI;
            fieldMatchers = [matchConstant, matchConstantLength, matchPattern, matchDateTime, matchDate, matchTime, matchMultiselect, matchSelect, matchRest];
        },
        
        onEvent: function (name, evt) {
            if (name === "htmx:persistFieldsClear") {
                let persistScope = htmx.closest(evt.detail.elt, selectors);
                if (persistScope) {
                    let storageType = availableStorages.find(x => persistScope.hasAttribute('persist-fields-' + x));
                    let indexOrCookieOptions = persistScope.getAttribute('persist-fields-' + storageType);
                    getFields(persistScope).forEach(field => {
                        let name = getName(field);
                        if (indexOrCookieOptions === 'indexed') {
                            let distinctNames = getFields(persistScope).map(getName).filter(distinct);
                            indexOrCookieOptions = distinctNames.indexOf(name);
                        } else if (indexOrCookieOptions === '' || storageType === 'query' || storageType === 'fragment') {
                            indexOrCookieOptions = undefined;
                        }
                        let storageKey = getStorageKey(storageType, name, indexOrCookieOptions);
                        clear(storageType, persistScope, storageKey);
                    });
                }
            } else if (name === "htmx:afterProcessNode") {
                getFields(evt.detail.elt).filter(e => !e.hasAttribute('data-persist-fields-initialized'))
                                         .forEach(field => {
                    let persistScope = htmx.closest(field, selectors);
                    if (persistScope) {
                        let storageType = availableStorages.find(x => persistScope.hasAttribute('persist-fields-' + x));
                        let indexOrCookieOptions = persistScope.getAttribute('persist-fields-' + storageType);
                        if (indexOrCookieOptions === 'indexed') {
                            let distinctNames = getFields(persistScope).map(getName).filter(distinct);
                            indexOrCookieOptions = distinctNames.indexOf(getName(field));
                        } else if (indexOrCookieOptions === '' || storageType === 'query' || storageType === 'fragment') {
                            indexOrCookieOptions = undefined;
                        }
                        handleStorage(persistScope, storageType, field, indexOrCookieOptions);
                    }
                });
            }
        }
    });
})();

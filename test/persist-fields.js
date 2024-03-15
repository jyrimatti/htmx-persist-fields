var expect = chai.expect;

describe("persist-fields extension", function() {
    var originalSearch;
    var originalHash;
    before(function() {
        originalSearch = window.location.search;
        originalHash = window.location.hash;
    });
    beforeEach(function () {
        clearWorkArea();
    });
    after(function() {
        history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname + originalSearch + originalHash);
    });

    function paramsToObject(params) {
        const result = {}
        for (const key of params.keys()) {
          result[key] = params.getAll(key);
        }
        return result;
    }
    
    function objectToParams(obj) {
        const result = new URLSearchParams();
        for (const key of Object.keys(obj)) {
          if (obj[key].length === 0) {
            result.append(key, '');
          } else {
            obj[key].forEach(x => result.append(key, x));
          }
        }
        return result;
    }



    ["query", "session", "local", "fragment", "cookie", "http"].forEach(storage => {
        var stor;

        ["/normalKeyValueStorage/", "indexed"].forEach(storageKey => {
            const indexed = storageKey === 'indexed';
            if (indexed && storage !== 'query' && storage !== 'fragment') {
                return; // indexed applies only to query/fragment
            }

            const expectEqual = (expected, value) => {
                const vals = Object.values(expected);
                expect(indexed ? vals.map(x => x.join('')) : expected).to.deep.equal(value);
            };

            beforeEach(function () {
                if (storage === 'session') {
                    stor = sessionStorage;
                    stor.clear();
                } else if (storage === 'local') {
                    stor = localStorage;
                    stor.clear();
                } else if (storage === 'cookie') {
                    document.cookie.split(";").forEach(c => { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString()); });
                    if (window.__cookies !== undefined) {
                        window.__cookies = '';
                    }
                } else if (storage === 'query' || storage === 'fragment') {
                    if (window.location.search + window.location.hash !== '') {
                        history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname);
                    }
                } else if (storage === 'http') {
                    stor = '{}';

                    this.server = makeServer();
                    this.server.configure({ respondImmediately: true });

                    this.server.respondWith('GET', storageKey, (xhr) => {
                        xhr.respond(200, { "Content-Type": "text/plain" }, stor) || '';
                    });
                    this.server.respondWith('PUT', storageKey, (xhr) => {
                        stor = xhr.requestBody;
                        xhr.respond(200);
                    });
                    this.server.respondWith('DELETE', storageKey, (xhr) => {
                        stor = '{}';
                        xhr.respond(200);
                    });
                }
            });
            afterEach(function () {
                if (storage === 'http') {
                    this.server.restore();
                }
            });

            const getItem = key => {
                if (storage === 'session' || storage === 'local') {
                    return JSON.parse(stor.getItem(key)) || {};
                } else if (storage === 'query') {
                    return indexed ? (window.location.search.length == 0 ? [] : window.location.search.substring(1).split('&')) : paramsToObject(new URLSearchParams(window.location.search));
                } else if (storage === 'fragment') {
                    return indexed ? (window.location.hash.length == 0 ? [] : window.location.hash.substring(1).split('#')) : paramsToObject(new URLSearchParams(window.location.hash.substring(1)));
                } else if (storage === 'cookie') {
                    return document.cookie
                                .split("; ")
                                .filter(x => x !== '')
                                .reduce((acc,x) => {
                                    let parts = x.split("=");
                                    acc[parts[0]] = parts[1].split(',').map(decodeURIComponent);
                                    return acc;
                                }, {});
                } else if (storage === 'http') {
                    return JSON.parse(stor);
                }
            }
            const setItem = (key, value, indexedSeparator) => {
                if (storage === 'session' || storage === 'local') {
                    stor.setItem(key, JSON.stringify(value));
                } else if (storage === 'query') {
                    const search = indexed ? Object.values(value).map(x => x.join(indexedSeparator || '')).join('&') : objectToParams(value);
                    history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname + '?' + search + window.location.hash);
                } else if (storage === 'fragment') {
                    const fragment = indexed ? Object.values(value).map(x => x.join(indexedSeparator || '')).join('#') : objectToParams(value);
                    history.replaceState(null, null, window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + '#' + fragment);
                } else if (storage === 'cookie') {
                    Object.keys(value).map(key => key + '=' + value[key].map(encodeURIComponent).join(",")).forEach(x => {
                        document.cookie = x;
                    });
                } else if (storage === 'http') {
                    stor = JSON.stringify(value);
                }
            };

            const delay = () => {
                if (storage === 'query' || storage === 'fragment') {
                    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
                        before('delay', function(done) {
                            setTimeout(function() {done();}, 750);
                        });
                    } else {
                        before('delay', function(done) {
                            setTimeout(function() {done();}, 500);
                        });
                    }
                }
            };

            describe(storageKey, function () {
                describe(storage + " storage", function () {
                    describe('single value is written to storage', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz'/></select></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked = true;
                                div.lastElementChild.checked = false;
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({foo: ['baz1']}, getItem(storageKey));
                            });
                        });
                        delay();
                    });

                    describe('multiple values are written to storage', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='bar' /></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1'], bar: ['baz2']}, getItem(storageKey));
                        });
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea><textarea name='bar'></textarea></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1'], bar: ['baz2']}, getItem(storageKey));
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz1'/></select><select name='bar'><option value='baz2'/></select></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1'], bar: ['baz2']}, getItem(storageKey));
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked = true;
                                div.lastElementChild.checked = true;
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                div.lastElementChild.dispatchEvent(new Event('change'));
                                expectEqual({foo: ['baz1'], bar: ['baz2']}, getItem(storageKey));
                            });
                        });
                        delay();
                    });

                    describe('multi-valued is is written to storage', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='foo' /></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1','baz2']}, getItem(storageKey));
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea><textarea name='foo'></textarea></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1','baz2']}, getItem(storageKey));
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select multiple name='foo'><option value='baz1'/><option value='baz2'/></select></div>")
                            div.firstElementChild.firstElementChild.selected = true;
                            div.firstElementChild.lastElementChild.selected = true;
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1','baz2']}, getItem(storageKey));
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='foo' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked = true;
                                div.lastElementChild.checked = false;
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                div.lastElementChild.dispatchEvent(new Event('change'));
                                expectEqual({foo: ['baz1']}, getItem(storageKey));
                            });
                        });
                        delay();
                    });

                    describe("single value is initialized from storage", function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz'/></select></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['bar']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' /><input name='foo' type='"+type+"' value='baz' /></div>")
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('multiple values are initialized from storage', function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='bar' /></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea><textarea name='bar'></textarea></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz1' /></select><select name='bar'><option value='baz2' /></select></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(true);
                            });
                        });
                        delay();
                    });

                    describe('multi-valued is initialized from storage', function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['baz1','baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' minlength='4' maxlength='4' /><input name='foo' /></div>");
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['baz1','baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' minlength='4' maxlength='4'></textarea><textarea name='foo'></textarea></div>");
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz1','baz2']}, ',');
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select multiple name='foo'><option value='baz1'/><option value='baz2'/></select></div>");
                            [...div.firstElementChild.selectedOptions].map(x => x.value).should.deep.equal(['baz1','baz2']);
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['baz1']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='foo' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('single value is not overridden if storage has no value', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='bar' /></div>")
                            div.firstElementChild.value.should.equal('bar');
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>bar</textarea></div>")
                            div.firstElementChild.value.should.equal('bar');
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='bar' selected /></select></div>")
                            div.firstElementChild.value.should.equal('bar');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' /></div>")
                                div.firstElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('multiple values are not overridden if storage has no value', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' /><input name='bar' value='baz2' /></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>baz1</textarea><textarea name='bar'>baz2</textarea></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='' /><option value='baz1' selected /></select><select name='bar'><option value='' /><option value='baz2' /></select></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' checked /></div>")
                                div.firstElementChild.checked.should.equal(false);
                                div.lastElementChild.checked.should.equal(true);
                            });
                        });
                        delay();
                    });

                    describe('multi-valued is not overridden if storage has no value', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' /><input name='foo' value='baz2' /></div>");
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>baz1</textarea><textarea name='foo'>baz2</textarea></div>");
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz1'/><option value='baz2' selected/></select></div>");
                            div.firstElementChild.value.should.equal('baz2');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' checked /><input name='foo' type='"+type+"' value='baz2' /></div>");
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    if (indexed) {
                        it('multi-valued remove trailing empty values', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='foo' /></div>");
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = '';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1']}, getItem(storageKey));
                        });

                        it('multi-valued remove trailing readonly not-required values', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='foo' readonly /></div>");
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1']}, getItem(storageKey));
                        });

                        it('multi-valued dont remove trailing readonly required values', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='foo' readonly required /></div>");
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1','baz2']}, getItem(storageKey));
                        });
    
                        it('multi-valued works with mixed inputs and selects', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><select name='foo'><option value='baz2' /></select></div>");
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.firstElementChild.selected = true;
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1','baz2']}, getItem(storageKey));
                        });

                        it('drops trailing separators', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo1' value='bar1' /><input name='foo2' value='bar2' /></div>");
                            div.firstElementChild.value = 'baz';
                            div.lastElementChild.value = '';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                        });

                        describe("indexed matcers", function () {
                            it('matchConstant', function () {
                                setItem(storageKey, {foo: ['baz1baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' readonly /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('baz1');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchConstantLength', function () {
                                setItem(storageKey, {foo: ['baz1baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' minlength='4' maxlength='4' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('baz1');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchPattern', function () {
                                setItem(storageKey, {foo: ['baz1baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' pattern='[a-z]{3,3}[0-9]' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('baz1');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchDateTime', function () {
                                setItem(storageKey, {foo: ['2014-02-14T01:42baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='datetime-local' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('2014-02-14T01:42');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchDate', function () {
                                setItem(storageKey, {foo: ['2014-02-14baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='date' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('2014-02-14');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchTime', function () {
                                setItem(storageKey, {foo: ['01:42baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='time' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('01:42');
                                div.lastElementChild.value.should.equal('baz2');
                            });

                            it('indexed-matchTime-seconds', function () {
                                setItem(storageKey, {foo: ['01:42:21baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='time' /><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('01:42:21');
                                div.lastElementChild.value.should.equal('baz2');
                            });
        
                            it('indexed-matchSelect', function () {
                                setItem(storageKey, {foo: ['baz1baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz1'></option></select><input name='foo' /></div>");
                                div.firstElementChild.value.should.equal('baz1');
                                div.lastElementChild.value.should.equal('baz2');
                            });
                        });
                    }

                    if (!indexed) {
                        // indexed storage doesn't differ between empty and missing value
                        
                        describe('single value is cleared if storage has empty value list', function () {
                            it('input', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='bar' /></div>")
                                div.firstElementChild.value.should.equal('');
                            });
                            it('textarea', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>bar</textarea></div>")
                                div.firstElementChild.value.should.equal('');
                            });
                            it('select', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value=''/><option value='bar' selected /></select></div>")
                                div.firstElementChild.value.should.equal('');
                            });
                            ["checkbox", "radio"].forEach(function (type) {
                                it(type, function () {
                                    setItem(storageKey, {foo: []});
                                    var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' checked /></div>")
                                    div.firstElementChild.checked.should.equal(false);
                                });
                            });
                            delay();
                        });
                    
                        describe('multiple values are cleared if storage has empty value list', function () {
                            it('input', function () {
                                setItem(storageKey, {foo: [], bar: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' /><input name='bar' value='baz2' /></div>")
                                div.firstElementChild.value.should.equal('');
                                div.lastElementChild.value.should.equal('');
                            });
                            it('textarea', function () {
                                setItem(storageKey, {foo: [], bar: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>baz1</textarea><textarea name='bar'>baz2</textarea></div>")
                                div.firstElementChild.value.should.equal('');
                                div.lastElementChild.value.should.equal('');
                            });
                            it('select', function () {
                                setItem(storageKey, {foo: [], bar: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value=''/><option value='baz1' selected/></select><select name='bar'><option value=''/><option value='baz2' selected/></select></div>")
                                div.firstElementChild.value.should.equal('');
                                div.lastElementChild.value.should.equal('');
                            });
                            ["checkbox", "radio"].forEach(function (type) {
                                it(type, function () {
                                    setItem(storageKey, {foo: [], bar: []});
                                    var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' checked /></div>")
                                    div.firstElementChild.checked.should.equal(false);
                                    div.lastElementChild.checked.should.equal(false);
                                });
                            });
                            delay();
                        });

                        describe('multi-valued is cleared if storage has empty value list', function () {
                            it('input', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' /><input name='foo' value='baz2' /></div>")
                                div.firstElementChild.value.should.equal('');
                                div.lastElementChild.value.should.equal('');
                            });
                            it('textarea', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>baz1</textarea><textarea name='foo'>baz2</textarea></div>")
                                div.firstElementChild.value.should.equal('');
                                div.lastElementChild.value.should.equal('');
                            });
                            it('select', function () {
                                setItem(storageKey, {foo: []});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' multiple><option value='baz1' selected /><option value='baz2' selected /></selected></div>")
                                div.firstElementChild.value.should.equal('');
                            });
                            ["checkbox", "radio"].forEach(function (type) {
                                it(type, function () {
                                    setItem(storageKey, {foo: []});
                                    var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' checked /><input name='foo' type='"+type+"' value='baz2' /></div>")
                                    div.firstElementChild.checked.should.equal(false);
                                    div.lastElementChild.checked.should.equal(false);
                                });
                            });
                            delay();
                        });

                        describe('single value is not stored if value equals default', function () {
                            it('input', function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='bar' /></div>")
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({}, getItem(storageKey));
                            });
                            it('textarea', function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'>bar</textarea></div>")
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({}, getItem(storageKey));
                            });
                            it('select', function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='bar' selected /></select></div>")
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({}, getItem(storageKey));
                            });
                            ["checkbox", "radio"].forEach(function (type) {
                                it(type, function () {
                                    var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' /></div>")
                                    div.firstElementChild.dispatchEvent(new Event('change'));
                                    expectEqual({}, getItem(storageKey));
                                });
                            });
                            delay();
                        });
                    }

                    describe('single readonly field is not set even if storage has value', function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['bar']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz' readonly /></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['bar']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' readonly>baz</textarea></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' readonly><option value=''/><option value='baz'/></select></div>")
                            div.firstElementChild.value.should.equal('');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['bar']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' readonly /></div>")
                                div.firstElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('multiple readonly fields are not set even if storage has value', function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['quux'], bar: ['quux']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' readonly /><input name='bar' value='baz2' readonly /></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['quux'], bar: ['quux']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' readonly>baz1</textarea><textarea name='bar' readonly>baz2</textarea></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' readonly><option value=''/><option value='baz1' /></select><select name='bar' readonly><option value=''/><option value='baz2' /></select></div>")
                            div.firstElementChild.value.should.equal('');
                            div.lastElementChild.value.should.equal('');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['baz1'], bar: ['baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' readonly /><input name='bar' type='"+type+"' value='baz2' readonly /></div>")
                                div.firstElementChild.checked.should.equal(false);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('multi-valued readonly field is not set even if storage has value', function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['bar','quux']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='baz1' readonly /><input name='foo' value='baz2' readonly /></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['bar','quux']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' readonly>baz1</textarea><textarea name='foo' readonly>baz2</textarea></div>")
                            div.firstElementChild.value.should.equal('baz1');
                            div.lastElementChild.value.should.equal('baz2');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz1','baz2']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' multiple readonly><option value='baz1' /><option value='baz2' /></select></div>")
                            div.firstElementChild.value.should.equal('');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['baz1','baz2']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' readonly /><input name='foo' type='"+type+"' value='baz2' readonly /></div>")
                                div.firstElementChild.checked.should.equal(false);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe("disabled field is initialized from storage", function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' disabled /></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' disabled></textarea></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' disabled><option value='baz'/></select></div>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['bar']});
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' disabled /><input name='foo' type='"+type+"' value='baz' /></div>")
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe("field of disabled fieldset is initialized from storage", function () {
                        it('input', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<fieldset hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /></fieldset>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('textarea', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<fieldset hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea></fieldset>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        it('select', function () {
                            setItem(storageKey, {foo: ['baz']});
                            var div = make("<fieldset hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz'/></select></fieldset>")
                            div.firstElementChild.value.should.equal('baz');
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                setItem(storageKey, {foo: ['bar']});
                                var div = make("<fieldset hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='bar' /><input name='foo' type='"+type+"' value='baz' /></fieldset>")
                                div.firstElementChild.checked.should.equal(true);
                                div.lastElementChild.checked.should.equal(false);
                            });
                        });
                        delay();
                    });

                    describe('disabled field is not written to storage', function () {
                        it('input', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' disabled /></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        it('textarea', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo' disabled></textarea></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        it('select', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo' disabled><option value='baz'/></select></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' disabled /><input name='bar' type='"+type+"' value='baz2' /></div>")
                                div.firstElementChild.checked = true;
                                div.lastElementChild.checked = false;
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({}, getItem(storageKey));
                            });
                        });
                        delay();
                    });

                    describe('field of disabled fieldset is not written to storage', function () {
                        it('input', function () {
                            var div = make("<fieldset disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /></fieldset>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        it('textarea', function () {
                            var div = make("<fieldset disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><textarea name='foo'></textarea></fieldset>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        it('select', function () {
                            var div = make("<fieldset disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><select name='foo'><option value='baz'/></select></fieldset>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({}, getItem(storageKey));
                        });
                        ["checkbox", "radio"].forEach(function (type) {
                            it(type, function () {
                                var div = make("<fieldset disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' type='"+type+"' value='baz1' /><input name='bar' type='"+type+"' value='baz2' /></fieldset>")
                                div.firstElementChild.checked = true;
                                div.lastElementChild.checked = false;
                                div.firstElementChild.dispatchEvent(new Event('change'));
                                expectEqual({}, getItem(storageKey));
                            });
                        });
                        delay();
                    });

                    describe('persistFieldsClear', function () {
                        it('clears storage', function () {
                            var div = make("<div disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                            htmx.trigger(div.firstElementChild, 'htmx:persistFieldsClear');
                            expectEqual({}, getItem(storageKey));
                        });

                        it('resets fields to default', function () {
                            var div = make("<div disabled hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' value='bar' /></div>")
                            div.firstElementChild.value = 'baz';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz']}, getItem(storageKey));
                            htmx.trigger(div.firstElementChild, 'htmx:persistFieldsClear');
                            expectEqual({}, getItem(storageKey));
                            div.firstElementChild.value.should.equal('bar');
                        });
                    });

                    describe('hx-ext-ignore', function () {
                        it('ignores field from persistence', function () {
                            var div = make("<div hx-ext='persist-fields' persist-fields-"+storage+"='" + storageKey + "'><input name='foo' /><input name='bar' hx-ext='ignore:persist-fields' /></div>")
                            div.firstElementChild.value = 'baz1';
                            div.lastElementChild.value = 'baz2';
                            div.firstElementChild.dispatchEvent(new Event('change'));
                            div.lastElementChild.dispatchEvent(new Event('change'));
                            expectEqual({foo: ['baz1']}, getItem(storageKey));
                        });
                    });
                });
            });
        });
    });
});

# htmx-persist-fields
Htmx extension to persist fields to different storages.

### Status

Experimental. I've used this a little, but not much.
Any feedback and suggestions are welcome!

### Motivation

Decouples state persistence from state handling.

Application can either synchronize its state to the DOM or use the DOM as the master of state directly. This also enables to use CSS for directly interacting with state, for example to show/hide elements based on some state.

### Available storage options
1) localStorage
2) sessionStorage
3) cookie
4) URL fragment
5) URL query string
6) http

### Install

```html
<script src="https://unpkg.com/htmx-persist-fields/dist/persist-fields.js"></script>
```

### Usage

```html
<body hx-ext="persist-fields">
  <div persist-fields-local="mystuff">
    <input name="param" value="val" />
  </div>
</body>
```

Specify the store with attribute:
1) persist-fields-local
   - suitable for persistent storage across sessions
   - value is store key
2) persist-fields-session
   - suitable for temporary storage for the duration of the session, and when the state is wanted to stay only client-side
   - value is store key
3) persist-fields-cookie
   - suitable for temporary storage for the duration of the session, and when the state might be used server-side
   - value is cookie options, e.g. `path=/;max-age=31536000`
4) persist-fields-fragment
   - suitable for state shared with other users using ordinary links, and when the state is wanted to stay only client-side
   - value is empty string or
   - value is constant `indexed`. Input values will be stored in the
     fragment as just values (without keys) separated by `#`
5) persist-fields-query
   - suitable for state shared with other users using ordinary links, and when the state might be used server-side
   - value is empty string or
   - value is constant `indexed`. Input values will be stored in the
     query as just values (without keys) separated by `&`
6) persist-fields-http
   - suitable for persistent storage across different browsers or users
   - value is the URL to GET the data from and PUT the data to.
 
All following descendants will be persisted, unless they are descendants of `hx-ext="ignore:persist-fields"`.
  1) form fields having `name` attribute and
  2) any elements having `persist-fields-name` attribute (e.g. a contenteditable div)

Readonly or disabled (or descendants of disabled `fieldset`) fields are initialized from the store, but their values/changes aren't persisted.

Only values that differ from their default value (if specified in the markup) are persisted, unless the field is marked `required`
in which case the value is always peristed.

For `indexed` storage, multiple inputs with the same `name` are concatenated when persisted,
and matched back to the correct input based on type/pattern/length/readonly-value when initialized. This can be used for example to build a nice looking "API" of the URL fragment.

To clear the persisted fields and restore inputs to their default values,
dispatch the `htmx:persistFieldsClear` event:
```html
<button onclick="htmx.trigger(this, 'htmx:persistFieldsClear')">restore defaults</button>
```


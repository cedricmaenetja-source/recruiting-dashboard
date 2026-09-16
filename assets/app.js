export function lockBtn($btn, options = {}) {
    if ($btn.data('loading')) return null;
    $btn.data('loading', true);

    const spinnerColor = options.spinnerColor || 'white';

    $btn.append(`<span class="spinner-btn-clicked" style="border-top-color:${spinnerColor}"></span>`);
    $btn.css('pointer-events', 'none');

    return function resetBtn() {
        $btn.data('loading', false);
        $btn.find('.spinner-btn-clicked').remove();
        $btn.css('pointer-events', 'auto');
    };
}

export function showToast(msg, type) {
  var el = document.createElement('div');
  el.className = 'notification ' + type;
  el.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      (type === 'success'
        ? '<path d="M2 7l3 3 7-6" stroke="white" stroke-width="1.5" stroke-linecap="round"/>'
        : '<circle cx="7" cy="7" r="5.5" stroke="white" stroke-width="1.3"/><path d="M7 4v3M7 8.5v.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>') +
    '</svg>' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3500);
}
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createScriptIdIframe, teleportStyle } from '@util/script';
import App from './App.vue';

$(() => {
  appendInexistentScriptButtons([{ name: '资源导入导出', visible: true }]);

  let app: ReturnType<typeof createApp> | null = null;
  let $iframe: JQuery<HTMLIFrameElement> | null = null;
  let styleDestroy: (() => void) | null = null;

  function cleanup() {
    if (app) {
      app.unmount();
      app = null;
    }
    if ($iframe) {
      $iframe.remove();
      $iframe = null;
    }
    if (styleDestroy) {
      styleDestroy();
      styleDestroy = null;
    }
  }

  const open = () => {
    if ($iframe) return;

    const pinia = createPinia();
    app = createApp(App, { onClose: cleanup }).use(pinia);

    $iframe = createScriptIdIframe()
      .appendTo('body')
      .css({
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        border: 'none',
        padding: 0,
        margin: 0,
      })
      .on('load', () => {
        const iframeDoc = $iframe![0].contentDocument!;
        const iframeBody = iframeDoc.body;
        iframeBody.style.margin = '0';
        iframeBody.style.padding = '0';
        iframeBody.style.width = '100%';
        iframeBody.style.height = '100%';
        iframeBody.style.overflow = 'hidden';

        const { destroy } = teleportStyle(iframeDoc.head);
        styleDestroy = destroy;

        app!.mount(iframeBody);
      });
  };

  // 兼容旧按钮名（如果用户脚本按钮列表里还残留“资源导入器”）
  eventOn(getButtonEvent('资源导入导出'), open);
  eventOn(getButtonEvent('资源导入器'), open);

  $(window).on('pagehide', cleanup);
});

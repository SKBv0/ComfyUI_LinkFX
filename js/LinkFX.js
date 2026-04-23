import { app } from "../../../scripts/app.js";
import { registerSidebarTab } from "./linkfx/sidebar_v2.js";
import { installRenderer } from "./linkfx/render.js";

const EXTENSION_NAME = "LinkFX";

if (!globalThis.__LINKFX_V2_BOOTED__) {
    globalThis.__LINKFX_V2_BOOTED__ = true;

    app.registerExtension({
        name: EXTENSION_NAME,
        init() {
            registerSidebarTab(app);

            const boot = () => {
                if (app?.canvas) {
                    installRenderer(app);
                    return;
                }
                setTimeout(boot, 200);
            };

            boot();
        }
    });
}

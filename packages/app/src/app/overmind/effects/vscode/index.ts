import {
  EditorSelection,
  Module,
  ModuleCorrection,
  ModuleError,
  Sandbox,
} from '@codesandbox/common/lib/types';
import { Reaction } from 'app/overmind';
import FontFaceObserver from 'fontfaceobserver';

import { VSCodeEditorManager } from './editorManager';
import { OnFileChangeData } from './editorManager/FilesSync';
import fs from './fs';
import { ICustomEditorApi, VSCodeManager } from './manager';

export type VsCodeOptions = {
  getCurrentSandbox: () => Sandbox;
  getCurrentModule: () => Module;
  getModulesByPath: () => { [path: string]: Module };
  onCodeChange: (data: OnFileChangeData) => void;
  onSelectionChange: (selection: any) => void;
  reaction: Reaction;
  // These two should be removed
  getSignal: any;
  getState: any;
};

declare global {
  interface Window {
    BrowserFS: any;
    getState: any;
    getSignal: any;
    monaco: any;
  }
}

/*
  We need to test:
  - Changing code
  - Turn on and off linting
  - Save code
  - Verify dirty indication
  - Add/remove dependencies
  - Verify preview updating
  - Resizing the editor
  - Change sandbox
  - Add/move/delete files
  - LIVE
*/

class VSCodeEffect {
  private controller: {
    getSignal: any;
    getState: any;
  };

  private manager: VSCodeManager;
  private editorManager: VSCodeEditorManager;
  private elements = {
    editor: document.createElement('div'),
    menubar: document.createElement('div'),
    statusbar: document.createElement('div'),
  };

  private customEditorApi: ICustomEditorApi;
  private editorPromise: Promise<{ monaco: any; editorApi: any }>;

  public initialize(options: VsCodeOptions) {
    // This should be changed to be more specific functions
    this.controller = {
      getSignal: options.getSignal,
      getState: options.getState,
    };

    this.styleElements();

    this.editorManager = new VSCodeEditorManager(options);
    this.manager = new VSCodeManager(this.controller, modulePath =>
      this.customEditorApi.getCustomEditor(modulePath)
    );

    // It will only load the editor once. We should probably call this
    const container = this.elements.editor;
    this.editorPromise = fs
      .initialize({
        onModulesByPathChange(cb) {
          options.reaction(
            ({ editor }) => editor.modulePaths,
            modulesByPath => cb(modulesByPath)
          );
        },
        getModulesByPath: options.getModulesByPath,
      })
      .then(() =>
        this.manager.loadEditor(
          container,
          async ({
            monaco,
            statusbarPart,
            menubarPart,
            editorPart,
            editorApi,
          }) => {
            await new FontFaceObserver('dm').load();

            const part = document.createElement('div');

            part.id = 'vscode-editor';
            part.className = 'part editor has-watermark';
            part.style.width = '100%';
            part.style.height = '100%';

            container.appendChild(part);

            statusbarPart.create(this.elements.statusbar);
            menubarPart.create(this.elements.menubar);

            editorPart.create(part);
            editorPart.layout(container.offsetWidth, container.offsetHeight);

            return { monaco, editorApi };
          }
        )
      );
  }

  private styleElements() {
    this.elements.editor.className = 'monaco-workbench';
    this.elements.editor.style.width = '100%';
    this.elements.editor.style.height = '100%';

    this.elements.menubar.style.alignItems = 'center';
    this.elements.menubar.style.height = '38px';
    this.elements.menubar.style.fontSize = '0.875rem';
    this.elements.menubar.className = 'menubar';

    this.elements.statusbar.className = 'part statusbar';
    this.elements.statusbar.id = 'workbench.parts.statusbar';
  }

  public callCallbackError(id: string, message?: string) {
    // @ts-ignore
    if (window.cbs && window.cbs[id]) {
      const errorMessage =
        message || 'Something went wrong while saving the file.';
      // @ts-ignore
      window.cbs[id](new Error(errorMessage), undefined);
      // @ts-ignore
      delete window.cbs[id];
    }
  }

  public callCallback(id: string) {
    // @ts-ignore
    if (window.cbs && window.cbs[id]) {
      // @ts-ignore
      window.cbs[id](undefined, undefined);
      // @ts-ignore
      delete window.cbs[id];
    }
  }

  public runCommand(command: string): Promise<void> {
    // @ts-ignore
    return this.manager.runCommand(command);
  }

  public async mountMenubar(el: HTMLElement) {
    el.appendChild(this.elements.menubar);
  }

  public setVimExtensionEnabled(enabled: boolean) {
    if (enabled) {
      this.manager.enableExtension('vscodevim.vim');
    } else {
      // Auto disable vim extension
      if (
        [null, undefined].includes(
          localStorage.getItem('vs-global://extensionsIdentifiers/disabled')
        )
      ) {
        localStorage.setItem(
          'vs-global://extensionsIdentifiers/disabled',
          '[{"id":"vscodevim.vim"}]'
        );
      }

      this.manager.disableExtension('vscodevim.vim');
    }
  }

  public getStatusbarElement() {
    return this.elements.statusbar;
  }

  public getEditorElement(
    getCustomEditor: ICustomEditorApi['getCustomEditor']
  ) {
    const start = performance.now();

    this.customEditorApi = {
      getCustomEditor,
    };

    this.editorPromise.then(({ editorApi, monaco }) => {
      console.log('Had to wait', performance.now() - start);
      this.editorManager.initialize(editorApi, monaco);
    });

    return this.elements.editor;
  }

  public unmount() {
    this.editorManager.dispose();
  }

  public async applyOperations(operations: {
    [x: string]: (string | number)[];
  }) {
    this.isApplyingCode = true;

    // The call to "apployOperations" should "try" and treat error as "moduleStateMismatch"
    // this.props.onModuleStateMismatch();

    try {
      await this.currentFilesSync.applyOperations(operations);
    } catch (error) {
      this.isApplyingCode = false;
      throw error;
    }
  }

  public updateOptions(options: { readOnly: boolean }) {
    this.editorManager.updateOptions(options);
  }

  public updateUserSelections(userSelections: EditorSelection[]) {
    this.editorManager.updateUserSelections(userSelections);
  }

  public changeModule(
    newModule: Module,
    errors?: ModuleError[],
    corrections?: ModuleCorrection[]
  ) {
    this.editorManager.changeModule(newModule, errors, corrections);
  }

  public setReadOnly(enabled: boolean) {
    this.editorManager.setReadOnly(enabled);
  }

  public openModule(module: Module) {
    this.editorManager.openModule(module);
  }

  public updateLayout(width: number, height: number) {
    this.editorManager.updateLayout(width, height);
  }
}

export default new VSCodeEffect();

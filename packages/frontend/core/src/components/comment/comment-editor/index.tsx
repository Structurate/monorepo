import { useConfirmModal, useLitPortalFactory } from '@affine/component';
import { LitDocEditor } from '@affine/core/blocksuite/editors';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import type { DocSnapshot, Store } from '@blocksuite/affine/store';
import { useFramework, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './style.css';

const usePatchSpecs = (readonly: boolean) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const framework = useFramework();
  const confirmModal = useConfirmModal();

  const patchedSpecs = useMemo(() => {
    const manager = getViewManager()
      .config.init()
      .foundation(framework)
      .theme(framework)
      .editorConfig(framework)
      .editorView({
        framework,
        reactToLit,
        confirmModal,
      })
      .linkedDoc(framework)
      .paragraph(false)
      .codeBlockHtmlPreview(framework).value;
    return manager
      .get(readonly ? 'preview-page' : 'page')
      .concat([ViewportElementExtension('.comment-editor-viewport')]);
  }, [confirmModal, framework, reactToLit, readonly]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
};

interface CommentEditorProps {
  preview?: boolean;
  defaultSnapshot: DocSnapshot;
  // for performance, we only update the snapshot when the editor blurs
  onChange: (snapshot: DocSnapshot) => void;
}

// todo: get rid of circular data changes
const useSnapshotDoc = (defaultSnapshot: DocSnapshot) => {
  const snapshotHelper = useService(SnapshotHelper);
  const [doc, setDoc] = useState<Store | undefined>(undefined);

  useEffect(() => {
    snapshotHelper
      .createStore(defaultSnapshot)
      .then(d => {
        setDoc(d);
      })
      .catch(e => {
        console.error(e);
      });
  }, [defaultSnapshot, snapshotHelper]);

  return doc;
};

export const CommentEditor = ({
  preview,
  defaultSnapshot,
  onChange,
}: CommentEditorProps) => {
  const [specs, portals] = usePatchSpecs(!!preview);
  const doc = useSnapshotDoc(defaultSnapshot);
  const snapshotHelper = useService(SnapshotHelper);
  const handleCommitChange = useCallback(() => {
    if (!doc) {
      return;
    }
    const snapshot = snapshotHelper.getSnapshot(doc);
    if (snapshot) {
      console.log('snapshot', snapshot);
      onChange(snapshot);
    }
  }, [doc, onChange, snapshotHelper]);
  return (
    <div className={clsx(styles.container, 'comment-editor-viewport')}>
      {doc && (
        <LitDocEditor specs={specs} doc={doc} onBlur={handleCommitChange} />
      )}
      {portals}
    </div>
  );
};

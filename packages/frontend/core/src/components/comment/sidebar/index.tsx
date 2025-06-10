import { IconButton, Menu } from '@affine/component';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import type { DocSnapshot } from '@blocksuite/affine/store';
import { FilterIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { CommentEditor } from '../comment-editor';
import * as styles from './style.css';

const SortFilterButton = () => {
  return (
    <Menu rootOptions={{ modal: false }} items={[]}>
      <IconButton icon={<FilterIcon />} />
    </Menu>
  );
};

const Header = () => {
  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>Comments</div>
      <SortFilterButton />
    </div>
  );
};

const CommentList = () => {
  return <div>CommentList</div>;
};

const CommentInput = () => {
  const [snapshot, setSnapshot] = useState<DocSnapshot>();
  const snapshotHelper = useService(SnapshotHelper);

  useEffect(() => {
    snapshotHelper
      .createEmptySnapshot()
      .then(snapshot => {
        if (snapshot) {
          setSnapshot(snapshot);
        }
      })
      .catch(err => {
        console.error(err);
      });
  }, [snapshotHelper]);

  return (
    <div>
      {snapshot && (
        <CommentEditor defaultSnapshot={snapshot} onChange={setSnapshot} />
      )}
    </div>
  );
};

export const CommentSidebar = () => {
  return (
    <div className={styles.container}>
      <Header />
      <CommentList />
      <CommentInput />
    </div>
  );
};

import type { Framework } from '@toeverything/infra';

import { DefaultServerService, WorkspaceServerService } from '../cloud';
import { EditorService } from '../editor';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DocCommentEntity } from './entities/doc-comment';
import { DocCommentStore } from './entities/doc-comment-store';
import { DocCommentManagerService } from './services/doc-comment-manager';
import { SnapshotHelper } from './services/snapshot-helper';

export function configureCommentModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocCommentManagerService, [EditorService])
    .service(SnapshotHelper, [
      WorkspaceService,
      WorkspaceServerService,
      DefaultServerService,
    ])
    .entity(DocCommentEntity, [SnapshotHelper])
    .entity(DocCommentStore, [
      WorkspaceService,
      WorkspaceServerService,
      DefaultServerService,
    ]);
}

import { Entity } from '@toeverything/infra';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import { GraphQLService } from '../../cloud/services/graphql';
import type { WorkspaceService } from '../../workspace';
import type {
  DocComment,
  DocCommentChangeListResult,
  DocCommentContent,
  DocCommentListResult,
} from '../types';

export class DocCommentStore extends Entity<{
  docId: string;
}> {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {
    super();
  }

  private get serverService() {
    return (
      this.workspaceServerService.server || this.defaultServerService.server
    );
  }

  private get graphqlService() {
    return this.serverService?.scope.get(GraphQLService);
  }

  private get currentWorkspaceId() {
    return this.workspaceService.workspace.id;
  }

  async listComments({
    after,
  }: {
    after?: string;
  }): Promise<DocCommentListResult> {
    throw new Error('Not implemented');
  }

  // pool every 30s
  async listCommentChanges({
    after,
  }: {
    after?: string;
  }): Promise<DocCommentChangeListResult> {
    throw new Error('Not implemented');
  }

  async createComment(commentInput: {
    content: DocCommentContent;
  }): Promise<DocComment> {
    throw new Error('Not implemented');
  }

  async updateComment(
    commentId: string,
    commentInput: {
      content: DocCommentContent;
    }
  ): Promise<void> {
    throw new Error('Not implemented');
  }

  async resolveComment(commentId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteComment(commentId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async createReply(
    commentId: string,
    replyInput: {
      content: DocCommentContent;
    }
  ): Promise<void> {
    throw new Error('Not implemented');
  }

  async updateReply(
    commentId: string,
    replyId: string,
    replyInput: {
      content: DocCommentContent;
    }
  ): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteReply(commentId: string, replyId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}

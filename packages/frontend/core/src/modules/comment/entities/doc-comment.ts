import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { catchError, of, Subject, switchMap, tap, timer } from 'rxjs';

import type { SnapshotHelper } from '../services/snapshot-helper';
import type {
  CommentId,
  CommentProvider,
  DocComment,
  DocCommentChangeListResult,
  DocCommentContent,
  PendingComment,
} from '../types';
import { DocCommentStore } from './doc-comment-store';

export class DocCommentEntity
  extends Entity<{
    docId: string;
    isActive: () => boolean;
  }>
  implements CommentProvider
{
  constructor(private readonly snapshotHelper: SnapshotHelper) {
    super();
  }
  private readonly store = this.framework.createEntity(DocCommentStore, {
    docId: this.props.docId,
  });

  loading$ = new LiveData<boolean>(false);
  comments$ = new LiveData<DocComment[]>([]);

  // pending comment is a comment that is not yet committed to the server
  readonly pendingComments$ = new LiveData<Map<string, PendingComment>>(
    new Map()
  );

  private readonly commentAdded$ = new Subject<CommentId>();
  private readonly commentResolved$ = new Subject<CommentId>();
  private readonly commentDeleted$ = new Subject<CommentId>();
  private readonly commentHighlighted$ = new Subject<CommentId | null>();

  private pollingDisposable?: Disposable;

  async addComment(selections?: Selection[]): Promise<void> {
    // todo: may need to properly bind the doc to the editor
    const doc = await this.snapshotHelper.createStore();
    if (!doc) {
      throw new Error('Failed to create doc');
    }
    const id = nanoid();
    const existing = this.pendingComments$.value;
    const pendingComment: PendingComment = {
      id,
      doc,
      selections,
    };

    this.pendingComments$.setValue(
      new Map([...existing, [id, pendingComment]])
    );
  }

  async addReply(commentId: string): Promise<void> {
    const doc = await this.snapshotHelper.createStore();
    if (!doc) {
      throw new Error('Failed to create doc');
    }
    const id = nanoid();
    const existing = this.pendingComments$.value;
    const pendingComment: PendingComment = {
      id,
      doc,
      commentId,
    };

    this.pendingComments$.setValue(
      new Map([...existing, [id, pendingComment]])
    );
  }

  dismissDraftComment(id: string): void {
    const existing = this.pendingComments$.value;
    const newMap = new Map(existing);
    newMap.delete(id);
    this.pendingComments$.setValue(newMap);
  }

  async commitComment(id: string): Promise<void> {
    const existing = this.pendingComments$.value;
    const pendingComment = existing.get(id);
    if (!pendingComment) {
      console.warn('Pending comment not found:', id);
      return;
    }
    const { doc } = pendingComment;
    const snapshot = this.snapshotHelper.getSnapshot(doc);
    if (!snapshot) {
      throw new Error('Failed to get snapshot');
    }
    const comment = await this.store.createComment({
      content: {
        snapshot,
        preview: 'New comment', // todo: get preview from selections
      },
    });
    const currentComments = this.comments$.value;
    this.comments$.setValue([...currentComments, comment]);
    this.commentAdded$.next(comment.id);
    this.dismissDraftComment(id);
  }

  async deleteComment(id: string): Promise<void> {
    await this.store.deleteComment(id);
    const currentComments = this.comments$.value;
    this.comments$.setValue(currentComments.filter(c => c.id !== id));
    this.commentDeleted$.next(id);
  }

  async updateComment(id: string, content: DocCommentContent): Promise<void> {
    await this.store.updateComment(id, { content });
    const currentComments = this.comments$.value;
    const updatedComments = currentComments.map(comment =>
      comment.id === id ? { ...comment, content } : comment
    );
    this.comments$.setValue(updatedComments);
  }

  async resolveComment(id: CommentId): Promise<void> {
    try {
      await this.store.resolveComment(id);

      // Update local state
      const currentComments = this.comments$.value;
      const updatedComments = currentComments.map(comment =>
        comment.id === id ? { ...comment, resolved: true } : comment
      );
      this.comments$.setValue(updatedComments);

      this.commentResolved$.next(id);
    } catch (error) {
      console.error('Failed to resolve comment:', error);
      throw error;
    }
  }

  highlightComment(id: CommentId | null): void {
    this.commentHighlighted$.next(id);
  }

  getComments(): CommentId[] {
    return this.comments$.value.map(comment => comment.id);
  }

  onCommentAdded(callback: (id: CommentId) => void): Disposable {
    const subscription = this.commentAdded$.subscribe(callback);
    return {
      [Symbol.dispose]: () => subscription.unsubscribe(),
    };
  }

  onCommentResolved(callback: (id: CommentId) => void): Disposable {
    const subscription = this.commentResolved$.subscribe(callback);
    return {
      [Symbol.dispose]: () => subscription.unsubscribe(),
    };
  }

  onCommentDeleted(callback: (id: CommentId) => void): Disposable {
    const subscription = this.commentDeleted$.subscribe(callback);
    return {
      [Symbol.dispose]: () => subscription.unsubscribe(),
    };
  }

  onCommentHighlighted(callback: (id: CommentId | null) => void): Disposable {
    const subscription = this.commentHighlighted$.subscribe(callback);
    return {
      [Symbol.dispose]: () => subscription.unsubscribe(),
    };
  }

  // Start polling comments every 30s
  // 1. when comments$ is empty, fetch all comments
  // 2. when comments$ is not empty, fetch changes (using end cursor)
  // 3. loop. when doc is not loaded, skip
  start(): void {
    if (this.pollingDisposable) {
      this.pollingDisposable[Symbol.dispose]();
    }

    // Initial load
    this.revalidate();

    // Set up polling every 30 seconds
    const polling$ = timer(30000, 30000).pipe(
      switchMap(() => {
        // Skip if document is not active
        if (!this.props.isActive()) {
          return of(null);
        }

        // If we have comments, fetch changes; otherwise fetch all
        if (this.comments$.value.length > 0) {
          return fromPromise(async () => {
            // Use local cursor logic inside the store; no persisted cursor here.
            return await this.store.listCommentChanges({});
          }).pipe(
            tap(changes => {
              if (changes) {
                this.handleCommentChanges(changes);
              }
            }),
            catchError(error => {
              console.error('Failed to fetch comment changes:', error);
              return of(null);
            })
          );
        } else {
          return fromPromise(async () => {
            const allComments: DocComment[] = [];
            let cursor = '';

            // Fetch all pages of comments
            while (true) {
              const result = await this.store.listComments({ after: cursor });
              allComments.push(...result.comments);
              cursor = result.endCursor;
              if (!result.hasNextPage) {
                break;
              }
            }

            // Update state with all comments
            this.comments$.setValue(allComments);

            return allComments;
          }).pipe(
            catchError(error => {
              console.error('Failed to fetch comments:', error);
              return of(null);
            })
          );
        }
      })
    );

    const subscription = polling$.subscribe();
    this.pollingDisposable = {
      [Symbol.dispose]: () => subscription.unsubscribe(),
    };
  }

  stop(): void {
    if (this.pollingDisposable) {
      this.pollingDisposable[Symbol.dispose]();
    }
  }

  private handleCommentChanges(changes: DocCommentChangeListResult): void {
    if (!changes || changes.length === 0) {
      return;
    }

    const currentComments = [...this.comments$.value];
    let commentsUpdated = false;

    for (const change of changes) {
      const { action, comment, commentId } = change;

      if (commentId) {
        // This is a reply change - handle separately
        this.handleReplyChange(currentComments, action, comment, commentId);
        commentsUpdated = true;
      } else {
        // This is a top-level comment change
        switch (action) {
          case 'create':
            // Add new comment if it doesn't already exist
            if (!currentComments.find(c => c.id === comment.id)) {
              currentComments.push(comment);
              commentsUpdated = true;
            }
            break;

          case 'update':
            // Update existing comment
            const updateIndex = currentComments.findIndex(
              c => c.id === comment.id
            );
            if (updateIndex !== -1) {
              currentComments[updateIndex] = comment;
              commentsUpdated = true;

              // If comment was resolved, emit resolved event
              if (
                comment.resolved &&
                !this.comments$.value[updateIndex]?.resolved
              ) {
              }
            }
            break;

          case 'delete':
            // Remove comment
            const deleteIndex = currentComments.findIndex(
              c => c.id === comment.id
            );
            if (deleteIndex !== -1) {
              currentComments.splice(deleteIndex, 1);
              commentsUpdated = true;
            }
            break;

          default:
            console.warn('Unknown comment change action:', action);
        }
      }
    }

    // Update the comments list if any changes were made
    if (commentsUpdated) {
      this.comments$.setValue(currentComments);
    }
  }

  private handleReplyChange(
    currentComments: DocComment[],
    action: 'create' | 'update' | 'delete',
    reply: DocComment,
    parentCommentId: string
  ): void {
    const parentIndex = currentComments.findIndex(
      c => c.id === parentCommentId
    );
    if (parentIndex === -1) {
      console.warn('Parent comment not found for reply:', parentCommentId);
      return;
    }

    const parentComment = currentComments[parentIndex];
    const replies = [...parentComment.replies];

    switch (action) {
      case 'create':
        // Add new reply if it doesn't already exist
        if (!replies.find(r => r.id === reply.id)) {
          replies.push(reply);
          currentComments[parentIndex] = { ...parentComment, replies };
        }
        break;

      case 'update':
        // Update existing reply
        const updateIndex = replies.findIndex(r => r.id === reply.id);
        if (updateIndex !== -1) {
          replies[updateIndex] = reply;
          currentComments[parentIndex] = { ...parentComment, replies };
        }
        break;

      case 'delete':
        // Remove reply
        const deleteIndex = replies.findIndex(r => r.id === reply.id);
        if (deleteIndex !== -1) {
          replies.splice(deleteIndex, 1);
          currentComments[parentIndex] = { ...parentComment, replies };
        }
        break;

      default:
        console.warn('Unknown reply change action:', action);
    }
  }

  revalidate = effect(
    switchMap(() => {
      return fromPromise(async () => {
        const allComments: DocComment[] = [];
        let cursor = '';

        // Fetch all pages of comments
        while (true) {
          const result = await this.store.listComments({ after: cursor });
          allComments.push(...result.comments);
          cursor = result.endCursor;
          if (!result.hasNextPage) {
            break;
          }
        }

        return allComments;
      }).pipe(
        tap(allComments => {
          // Update state with all comments
          this.comments$.setValue(allComments);
        }),
        onStart(() => this.loading$.setValue(true)),
        onComplete(() => this.loading$.setValue(false)),
        catchError(error => {
          console.error('Failed to fetch comments:', error);
          this.loading$.setValue(false);
          return of([]);
        })
      );
    })
  );

  override dispose(): void {
    this.stop();
    this.commentAdded$.complete();
    this.commentResolved$.complete();
    this.commentDeleted$.complete();
    this.commentHighlighted$.complete();
    super.dispose();
  }
}

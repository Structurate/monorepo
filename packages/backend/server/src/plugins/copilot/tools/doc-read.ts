import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { Models, publicUserSelect } from '../../../models';
import type { CopilotChatOptions } from '../providers';

const logger = new Logger('ReadDocTool');

export const buildDocContentGetter = (
  ac: AccessController,
  docReader: DocReader,
  models: Models
) => {
  const getDoc = async (options: CopilotChatOptions, docId?: string) => {
    if (!options?.user || !options?.workspace || !docId) {
      return;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Read');
    if (!canAccess) {
      logger.warn(
        `User ${options.user} does not have access to doc ${docId} in workspace ${options.workspace}`
      );
      return;
    }

    const docMeta = await models.doc.getSnapshot(options.workspace, docId, {
      select: {
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: publicUserSelect,
        },
        updatedByUser: {
          select: publicUserSelect,
        },
      },
    });
    if (!docMeta) {
      return;
    }

    const content = await docReader.getDocMarkdown(options.workspace, docId);
    if (!content) {
      return;
    }

    return {
      ...content,
      ...docMeta,
    };
  };
  return getDoc;
};

export const createDocReadTool = (
  getDoc: (targetId?: string) => Promise<object | undefined>
) => {
  return tool({
    description: 'Read the content of a doc in the current workspace',
    parameters: z.object({
      doc_id: z.string().describe('The target doc to read'),
    }),
    execute: async ({ doc_id }) => {
      try {
        const doc = await getDoc(doc_id);
        if (!doc) {
          return 'Doc not found or doc is empty';
        }
        return { ...doc };
      } catch (err) {
        logger.error(`Failed to read the doc ${doc_id}`, err);
        return 'Failed to read the doc';
      }
    },
  });
};

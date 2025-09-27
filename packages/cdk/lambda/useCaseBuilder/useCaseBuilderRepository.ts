import {
  IsFavorite,
  IsShared,
  UseCaseCommon,
  UseCaseInTable,
  UseCaseAsOutput,
  UseCaseContent,
  ListUseCasesResponse,
  ListFavoriteUseCasesResponse,
  ListRecentlyUsedUseCasesResponse,
} from '../../../../types/src/index';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const USECASE_TABLE_NAME: string = process.env.USECASE_TABLE_NAME!;
const USECASE_ID_INDEX_NAME: string = process.env.USECASE_ID_INDEX_NAME!;
const dynamoDb = new DynamoDBClient({});
const dynamoDbDocument = DynamoDBDocumentClient.from(dynamoDb);

// 最近使用されたユースケースの最大数
// 実際には、場合によってはRECENTLY_USED_SAVE_LIMIT + 1になる
// 詳細はupdateRecentlyUsedUseCase関数を参照
const RECENTLY_USED_SAVE_LIMIT = 100;

const getUserIdFromKey = (key: string): string => {
  return key.split('#').slice(1).join('#');
};

// useCaseIdでユースケースを取得するためのクエリコマンドを作成
const createFindUseCaseByUseCaseIdCommand = (useCaseId: string) =>
  new QueryCommand({
    TableName: USECASE_TABLE_NAME,
    IndexName: USECASE_ID_INDEX_NAME,
    KeyConditionExpression:
      '#useCaseId = :useCaseId and begins_with(#dataType, :dataTypePrefix)',
    ExpressionAttributeNames: {
      '#useCaseId': 'useCaseId',
      '#dataType': 'dataType',
    },
    ExpressionAttributeValues: {
      ':useCaseId': useCaseId,
      ':dataTypePrefix': 'useCase',
    },
  });

// useCaseIdでユースケースを取得
const innerFindUseCaseByUseCaseId = async (
  useCaseId: string
): Promise<UseCaseInTable | null> => {
  const command = createFindUseCaseByUseCaseIdCommand(useCaseId);
  const useCaseInTable = await dynamoDbDocument.send(command);
  return (useCaseInTable.Items?.[0] as UseCaseInTable) || null;
};

// userIdでユースケース一覧を取得
const innerFindUseCasesByUserId = async (
  userId: string,
  _exclusiveStartKey?: string
): Promise<{ useCases: UseCaseInTable[]; lastEvaluatedKey?: string }> => {
  const exclusiveStartKey = _exclusiveStartKey
    ? JSON.parse(Buffer.from(_exclusiveStartKey, 'base64').toString())
    : undefined;
  const useCasesInTable = await dynamoDbDocument.send(
    new QueryCommand({
      TableName: USECASE_TABLE_NAME,
      KeyConditionExpression:
        '#id = :id and begins_with(#dataType, :dataTypePrefix)',
      ExpressionAttributeNames: {
        '#id': 'id',
        '#dataType': 'dataType',
      },
      ExpressionAttributeValues: {
        ':id': `useCase#${userId}`,
        ':dataTypePrefix': 'useCase',
      },
      ScanIndexForward: false,
      Limit: 30, // ページごとのマイユースケース数
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    useCases: (useCasesInTable.Items || []) as UseCaseInTable[],
    lastEvaluatedKey: useCasesInTable.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(useCasesInTable.LastEvaluatedKey)).toString(
          'base64'
        )
      : undefined,
  };
};

// useCaseId配列からユースケース一覧を取得
const innerFindUseCasesByUseCaseIds = async (
  useCaseIds: string[]
): Promise<UseCaseInTable[]> => {
  // 複数のクエリを並列実行
  const useCasesInTable: QueryCommandOutput[] = await Promise.all(
    useCaseIds.map((useCaseId) =>
      dynamoDb.send(createFindUseCaseByUseCaseIdCommand(useCaseId))
    )
  );
  return useCasesInTable.flatMap(
    (useCaseInTable) =>
      (useCaseInTable.Items?.slice(0, 1) || []) as UseCaseInTable[]
  );
};

// userIdで特定のデータタイプ（お気に入り、最近使用）の一覧を取得（全件）
const innerFindCommonsByUserIdAndDataType = async (
  userId: string,
  dataTypePrefix: string
): Promise<UseCaseCommon[]> => {
  const commons = await dynamoDbDocument.send(
    new QueryCommand({
      TableName: USECASE_TABLE_NAME,
      KeyConditionExpression:
        '#id = :id and begins_with(#dataType, :dataTypePrefix)',
      ExpressionAttributeNames: {
        '#id': 'id',
        '#dataType': 'dataType',
      },
      ExpressionAttributeValues: {
        ':id': `useCase#${userId}`,
        ':dataTypePrefix': dataTypePrefix,
      },
      ScanIndexForward: false,
    })
  );

  return (commons.Items || []) as UseCaseCommon[];
};

// userIdで特定のデータタイプ（お気に入り、最近使用）の一覧を取得（ページネーション対応）
const innerFindCommonsByUserIdAndDataTypePagniation = async (
  userId: string,
  dataTypePrefix: string,
  _exclusiveStartKey?: string
): Promise<{ commons: UseCaseCommon[]; lastEvaluatedKey?: string }> => {
  const exclusiveStartKey = _exclusiveStartKey
    ? JSON.parse(Buffer.from(_exclusiveStartKey, 'base64').toString())
    : undefined;
  const commons = await dynamoDbDocument.send(
    new QueryCommand({
      TableName: USECASE_TABLE_NAME,
      KeyConditionExpression:
        '#id = :id and begins_with(#dataType, :dataTypePrefix)',
      ExpressionAttributeNames: {
        '#id': 'id',
        '#dataType': 'dataType',
      },
      ExpressionAttributeValues: {
        ':id': `useCase#${userId}`,
        ':dataTypePrefix': dataTypePrefix,
      },
      ScanIndexForward: false,
      Limit: 20, // ページごとのお気に入り/最近使用数
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    commons: (commons.Items || []) as UseCaseCommon[],
    lastEvaluatedKey: commons.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(commons.LastEvaluatedKey)).toString('base64')
      : undefined,
  };
};

// useCaseIdに関連する全データ（本体、お気に入り、最近使用）を取得
const innerFindCommonsByUseCaseId = async (
  useCaseId: string
): Promise<UseCaseCommon[]> => {
  const commons = await dynamoDbDocument.send(
    new QueryCommand({
      TableName: USECASE_TABLE_NAME,
      IndexName: USECASE_ID_INDEX_NAME,
      KeyConditionExpression: '#useCaseId = :useCaseId',
      ExpressionAttributeNames: {
        '#useCaseId': 'useCaseId',
      },
      ExpressionAttributeValues: {
        ':useCaseId': useCaseId,
      },
    })
  );

  return (commons.Items || []) as UseCaseCommon[];
};

export const createUseCase = async (
  userId: string,
  content: UseCaseContent
): Promise<UseCaseAsOutput> => {
  const id = `useCase#${userId}`;
  const useCaseId = crypto.randomUUID();
  const dataType = `useCase#${Date.now()}`;

  const item: UseCaseInTable = {
    id,
    dataType,
    useCaseId,
    title: content.title,
    description: content.description,
    promptTemplate: content.promptTemplate,
    inputExamples: content.inputExamples,
    fixedModelId: content.fixedModelId,
    fileUpload: content.fileUpload,
    isShared: false,
  };

  await dynamoDbDocument.send(
    new PutCommand({
      TableName: USECASE_TABLE_NAME,
      Item: item,
    })
  );

  return {
    ...item,
    isFavorite: false,
    isMyUseCase: true,
  };
};

export const getUseCase = async (
  userId: string,
  useCaseId: string
): Promise<UseCaseAsOutput | null> => {
  const useCaseInTable = await innerFindUseCaseByUseCaseId(useCaseId);

  if (!useCaseInTable) {
    return null;
  }

  const isMyUseCase = getUserIdFromKey(useCaseInTable.id) === userId;
  const isShared = useCaseInTable.isShared;

  // 自分のユースケースではなく、共有されていない場合は取得しない
  if (!isMyUseCase && !isShared) {
    return null;
  }

  const favorites = await innerFindCommonsByUserIdAndDataType(
    userId,
    'favorite'
  );
  const favoritesUseCaseIds = favorites.map((f) => f.useCaseId);

  const useCaseAsOutput: UseCaseAsOutput = {
    ...useCaseInTable,
    isFavorite: favoritesUseCaseIds.includes(useCaseId),
    isMyUseCase,
  };

  return useCaseAsOutput;
};

export const listUseCases = async (
  userId: string,
  exclusiveStartKey?: string
): Promise<ListUseCasesResponse> => {
  const { useCases: useCasesInTable, lastEvaluatedKey } =
    await innerFindUseCasesByUserId(userId, exclusiveStartKey);

  const favorites = await innerFindCommonsByUserIdAndDataType(
    userId,
    'favorite'
  );
  const favoritesUseCaseIds = favorites.map((f) => f.useCaseId);

  const useCasesAsOutput: UseCaseAsOutput[] = useCasesInTable.map((u) => {
    return {
      ...u,
      isFavorite: favoritesUseCaseIds.includes(u.useCaseId),
      isMyUseCase: getUserIdFromKey(u.id) === userId,
    };
  });

  return {
    data: useCasesAsOutput,
    lastEvaluatedKey,
  };
};

export const updateUseCase = async (
  userId: string,
  useCaseId: string,
  content: UseCaseContent
): Promise<void> => {
  const useCaseInTable = await innerFindUseCaseByUseCaseId(useCaseId);

  if (!useCaseInTable) {
    console.error(
      `Use case doesn't exist for userId=${userId} and useCaseId=${useCaseId}`
    );
    return;
  }

  if (getUserIdFromKey(useCaseInTable.id) !== userId) {
    console.error(
      `userId mismatch ${userId} vs ${getUserIdFromKey(useCaseInTable.id)}`
    );
    return;
  }

  await dynamoDbDocument.send(
    new UpdateCommand({
      TableName: USECASE_TABLE_NAME,
      Key: {
        id: useCaseInTable.id,
        dataType: useCaseInTable.dataType,
      },
      UpdateExpression:
        'set title = :title, promptTemplate = :promptTemplate, description = :description, inputExamples = :inputExamples, fixedModelId = :fixedModelId, fileUpload = :fileUpload',
      ExpressionAttributeValues: {
        ':title': content.title,
        ':promptTemplate': content.promptTemplate,
        ':description': content.description ?? '',
        ':inputExamples': content.inputExamples ?? [],
        ':fixedModelId': content.fixedModelId ?? '',
        ':fileUpload': !!content.fileUpload,
      },
    })
  );
};

export const deleteUseCase = async (
  userId: string,
  useCaseId: string
): Promise<void> => {
  const useCaseInTable = await innerFindUseCaseByUseCaseId(useCaseId);

  if (!useCaseInTable) {
    console.error(
      `Use case doesn't exist for userId=${userId} and useCaseId=${useCaseId}`
    );
    return;
  }

  if (getUserIdFromKey(useCaseInTable.id) !== userId) {
    console.error(
      `userId mismatch ${userId} vs ${getUserIdFromKey(useCaseInTable.id)}`
    );
    return;
  }

  const commons = await innerFindCommonsByUseCaseId(useCaseId);
  const requestItems = commons.map((common) => {
    return {
      DeleteRequest: {
        Key: {
          id: common.id,
          dataType: common.dataType,
        },
      },
    };
  });

  // Delete body, favorite, recently used at once
  await dynamoDbDocument.send(
    new BatchWriteCommand({
      RequestItems: {
        [USECASE_TABLE_NAME]: requestItems,
      },
    })
  );
};

export const listFavoriteUseCases = async (
  userId: string,
  exclusiveStartKey?: string
): Promise<ListFavoriteUseCasesResponse> => {
  const { commons, lastEvaluatedKey } =
    await innerFindCommonsByUserIdAndDataTypePagniation(
      userId,
      'favorite',
      exclusiveStartKey
    );
  const useCaseIds = commons.map((c) => c.useCaseId);
  const useCasesInTable = await innerFindUseCasesByUseCaseIds(useCaseIds);
  const useCasesAsOutput: UseCaseAsOutput[] = useCasesInTable.map((u) => {
    return {
      ...u,
      isFavorite: true,
      isMyUseCase: getUserIdFromKey(u.id) === userId,
    };
  });

  // マイユースケースまたは共有
  const useCasesAsOutputFiltered = useCasesAsOutput.filter((u) => {
    return u.isMyUseCase || u.isShared;
  });

  return {
    data: useCasesAsOutputFiltered,
    lastEvaluatedKey,
  };
};

export const toggleFavorite = async (
  userId: string,
  useCaseId: string
): Promise<IsFavorite> => {
  // マイお気に入り一覧を取得し、既に登録されているかチェック
  // MEMO: お気に入り数が大量の場合、リストから溢れる可能性がある
  const commons = await innerFindCommonsByUserIdAndDataType(userId, 'favorite');
  const useCaseIds = commons.map((c) => c.useCaseId);
  const index = useCaseIds.indexOf(useCaseId);

  if (index >= 0) {
    // お気に入り解除
    const common = commons[index];

    await dynamoDbDocument.send(
      new DeleteCommand({
        TableName: USECASE_TABLE_NAME,
        Key: {
          id: common.id,
          dataType: common.dataType,
        },
      })
    );

    return { isFavorite: false };
  } else {
    // お気に入り登録
    await dynamoDbDocument.send(
      new PutCommand({
        TableName: USECASE_TABLE_NAME,
        Item: {
          id: `useCase#${userId}`,
          dataType: `favorite#${Date.now()}`,
          useCaseId: useCaseId,
        },
      })
    );

    return { isFavorite: true };
  }
};

export const toggleShared = async (
  userId: string,
  useCaseId: string
): Promise<IsShared> => {
  const useCaseInTable = await innerFindUseCaseByUseCaseId(useCaseId);

  if (!useCaseInTable) {
    console.error(
      `Use case doesn't exist for userId=${userId} and useCaseId=${useCaseId}`
    );
    return { isShared: false };
  }

  if (getUserIdFromKey(useCaseInTable.id) !== userId) {
    console.error(
      `userId mismatch ${userId} vs ${getUserIdFromKey(useCaseInTable.id)}`
    );
    return { isShared: false };
  }

  await dynamoDbDocument.send(
    new UpdateCommand({
      TableName: USECASE_TABLE_NAME,
      Key: {
        id: useCaseInTable.id,
        dataType: useCaseInTable.dataType,
      },
      UpdateExpression: 'set isShared = :isShared',
      ExpressionAttributeValues: {
        ':isShared': !useCaseInTable.isShared,
      },
    })
  );

  return { isShared: !useCaseInTable.isShared };
};

export const listRecentlyUsedUseCases = async (
  userId: string,
  exclusiveStartKey?: string
): Promise<ListRecentlyUsedUseCasesResponse> => {
  const { commons, lastEvaluatedKey } =
    await innerFindCommonsByUserIdAndDataTypePagniation(
      userId,
      'recentlyUsed',
      exclusiveStartKey
    );
  const useCaseIds = commons.map((c) => c.useCaseId);

  const [useCasesInTable, favorites] = await Promise.all([
    // ユーザーのユースケース一覧
    innerFindUseCasesByUseCaseIds(useCaseIds),
    // ユーザーのお気に入り一覧
    innerFindCommonsByUserIdAndDataType(userId, 'favorite'),
  ]);
  const favoritesUseCaseIds = new Set(favorites.map((f) => f.useCaseId));

  const useCasesAsOutput: UseCaseAsOutput[] = useCasesInTable.map((u) => {
    return {
      ...u,
      isFavorite: favoritesUseCaseIds.has(u.useCaseId),
      isMyUseCase: getUserIdFromKey(u.id) === userId,
    };
  });

  // 自分のものまたは共有
  const useCasesAsOutputFiltered = useCasesAsOutput.filter((u) => {
    return u.isMyUseCase || u.isShared;
  });

  return {
    data: useCasesAsOutputFiltered,
    lastEvaluatedKey,
  };
};

export const updateRecentlyUsedUseCase = async (
  userId: string,
  useCaseId: string
): Promise<void> => {
  const itemsToDelete: UseCaseCommon[] = [];

  // 最近使用されたユースケースデータのスキャンを実行
  const commons = await innerFindCommonsByUserIdAndDataType(
    userId,
    'recentlyUsed'
  );

  // 最近使用されたユースケースの最大数
  if (commons.length > RECENTLY_USED_SAVE_LIMIT) {
    itemsToDelete.push(...commons.slice(RECENTLY_USED_SAVE_LIMIT));
  }

  const useCaseIds = commons.map((c) => c.useCaseId);
  const index = useCaseIds.indexOf(useCaseId);

  // 同じユースケースの古い履歴がある場合、削除対象とする
  if (0 <= index && index <= RECENTLY_USED_SAVE_LIMIT - 1) {
    itemsToDelete.push(commons[index]);
  }

  // 削除と追加を同時に実行
  // 新しい履歴が追加された場合（既存の履歴がない）、履歴数はRECENTLY_USED_SAVE_LIMIT + 1になるが、これは許容範囲
  await dynamoDbDocument.send(
    new TransactWriteCommand({
      TransactItems: [
        ...itemsToDelete.map((item: UseCaseCommon) => {
          return {
            Delete: {
              TableName: USECASE_TABLE_NAME,
              Key: {
                id: item.id,
                dataType: item.dataType,
              },
            },
          };
        }),
        {
          Put: {
            TableName: USECASE_TABLE_NAME,
            Item: {
              id: `useCase#${userId}`,
              dataType: `recentlyUsed#${Date.now()}`,
              useCaseId,
            },
          },
        },
      ],
    })
  );
};

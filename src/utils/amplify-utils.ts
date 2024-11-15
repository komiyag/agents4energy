import { generateClient } from "aws-amplify/data";
import { list, ListPaginateWithPathInput } from 'aws-amplify/storage';

import { type Schema } from "../../amplify/data/resource";

export const amplifyClient = generateClient<Schema>();

type BedrockAnthropicBodyType = {
    id: string;
    type: string;
    role: string;
    model: string;
    content: {
        type: string;
        text: string;
    }[];
    stop_reason: string;
    stop_sequence: null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
};

export const invokeBedrockModelParseBodyGetText = async (prompt: string) => {
    console.log('Prompt: ', prompt)
    const response = await amplifyClient.queries.invokeBedrock({ prompt: prompt })
    console.log('Bedrock Response: ', response.data)
    if (!(response.data && response.data.body)) {
        console.log('No response from bedrock after prompt: ', prompt)
        return
    }
    const bedrockResponseBody = JSON.parse(response.data.body) as BedrockAnthropicBodyType
    console.log('Bedrock Response Body: ', bedrockResponseBody)
    return bedrockResponseBody.content.map(item => item.text).join('\n')
}


export interface S3Asset {
    Key: string;
    Size: number | undefined;
    IsFolder: boolean;
}

export const onFetchObjects = async (pathPrefix: string): Promise<readonly S3Asset[]> => {
    console.log('pathPrefix', pathPrefix)
    try {

        const result = await list({
            path: pathPrefix || "well-files/",
            pageSize: 10,
            options: {
                subpathStrategy: { strategy: 'exclude' }
            },
            // nextToken: nextToken
        } as ListPaginateWithPathInput);

        console.log('list result: ', result)

        const objects: S3Asset[] = result.items.map((item) => ({
            Key: item.path,
            Size: item.size,
            IsFolder: false
        }));

        if (result.excludedSubpaths) {
            const folders: S3Asset[] = result.excludedSubpaths.map((item) => {
                return {
                    Key: item.substring(pathPrefix.length),
                    Size: undefined,
                    IsFolder: true
                }
            })

            objects.push(...folders)
        }

        return objects

    } catch (error) {
        console.error('Error fetching S3 objects:', error);
        return Promise.resolve([]); // Return an empty array in case of an error
    }
}
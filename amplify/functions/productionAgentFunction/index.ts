import { Schema } from '../../data/resource';
import { env } from '$amplify/env/production-agent-function';

import { ChatBedrockConverse } from "@langchain/aws";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage, MessageContentText } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { calculatorTool, wellTableTool, convertPdfToImageTool } from './toolBox';
import { generateAmplifyClientWrapper } from '../utils/amplifyUtils'

import { convertPdfToImages, getInfoFromPdf, listBedrockAgents } from '../graphql/queries'

const amplifyClientWrapper = generateAmplifyClientWrapper(env)

// Define the tools for the agent to use
const agentTools = [calculatorTool, wellTableTool, convertPdfToImageTool];

export const handler: Schema["invokeProductionAgent"]["functionHandler"] = async (event) => {

    // console.log('event: ', event)
    // console.log('context: ', context)
    // console.log('Amplify env: ', env)
    // console.log('process.env: ', process.env)

    if (!(event.arguments.chatSessionId)) throw new Error("Event does not contain chatSessionId");
    if (!event.identity) throw new Error("Event does not contain identity");
    if (!('sub' in event.identity)) throw new Error("Event does not contain user");

    try {
        
        // console.log("test get images of pdf")

        // const convertPdfToImagesResponse = await amplifyClientWrapper.testFunction({
        //     chatSessionId: event.arguments.chatSessionId,
        //     latestHumanMessageText: event.arguments.input
        // })
        // console.log('convertPdfToImagesResponse: ', convertPdfToImagesResponse)

        // // const convertPdfToImagesResponse = await amplifyClientWrapper.amplifyClient.graphql({
        // //     query: listBedrockAgents,
        // //     variables: {
        // //         s3Key: "production-agent/well-files/field=SanJuanEast/uwi=30-039-07715/30-039-07715_00131.pdf",
        // //         tableColumns: "[{\"columnName\": \"date\", \"columnDescription\":\"Date of the operation\"}]",
        // //         dataToExclude:"[\"astronauts\"]",
        // //         dataToInclude: "[\"ops\"]"
        // //     }
        // // })

        // // const convertPdfToImagesResponse = await amplifyClientWrapper.amplifyClient.graphql({
        // //     query: convertPdfToImages,
        // //     variables: {
        // //         s3Key: "production-agent/well-files/field=SanJuanEast/uwi=30-039-07715/30-039-07715_00131.pdf"
        // //     }
        // // })
        
        // console.log('convertPdfToImagesResponse: ', convertPdfToImagesResponse)

        const messages = await amplifyClientWrapper.getChatMessageHistory({
            chatSessionId: event.arguments.chatSessionId,
            latestHumanMessageText: event.arguments.input
        })

        console.log("mesages in langchain form: ", messages)

        const agentModel = new ChatBedrockConverse({
            model: process.env.MODEL_ID,
            temperature: 0
        });

        const agent = createReactAgent({
            llm: agentModel,
            tools: agentTools,
        });

        const input = {
            messages: messages,
        }

        for await (
            const chunk of await agent.stream(input, {
                streamMode: "values",
            })
        ) {
            const newMessage: BaseMessage = chunk.messages[chunk.messages.length - 1];

            if (!(newMessage instanceof HumanMessage)) {
                console.log('newMessage: ', newMessage)
                await amplifyClientWrapper.publishMessage({
                    chatSessionId: event.arguments.chatSessionId, 
                    owner: event.identity.sub, 
                    message: newMessage
                })
            }

            // Maybe its ok to just pass the image from the tool to the agent without persisting the image in the message?
            // //If the message is a tool message with a s3Key, convert it to an image and add it to the tool message
            // agent.getState({})
            // agent.updateState({},{

            // })
            // //If the message is a tool message with a s3Key, convert it to an image and add it to the tool message
            // if (newMessage instanceof ToolMessage && newMessage.content.s3Key) {
            //     const convertPdfToImagesResponse = await amplifyClientWrapper.amplifyClient.graphql({
            //         query: convertPdfToImages,
            //         variables: {
            //             s3Key: newMessage.content.s3Key
            //         }
            //     })
            //     console.log('convertPdfToImagesResponse: ', convertPdfToImagesResponse)
            //     newMessage.content.images = convertPdfToImagesResponse.data.convertPdfToImages
            // }
            
        }
        return "Invocation Successful!";

    } catch (error) {

        console.log('error: ', error)

        if (error instanceof Error) {
            //If there is an error
            const AIErrorMessage = new AIMessage({ content: error.message + `\n model id: ${process.env.MODEL_ID}` })
            await amplifyClientWrapper.publishMessage({
                chatSessionId: event.arguments.chatSessionId, 
                owner: event.identity.sub, 
                message: AIErrorMessage
            })
        }
        return "Error"
    }

};
"use client"
import { stringify } from 'yaml'

import React, { useEffect, useState } from 'react';
import type { Schema } from '@/../amplify/data/resource';
import { amplifyClient, invokeBedrockModelParseBodyGetText } from '@/utils/amplify-utils';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';

import { formatDate } from "@/utils/date-utils";
import DropdownMenu from '@/components/DropDownMenu';
import AddSideBar from '@/components/SideBar';

import { defaultAgents } from '@/utils/config'
import { Message } from '@/utils/types'

import '@aws-amplify/ui-react/styles.css'

import {
    Typography,
    Box,
    Drawer,
    Toolbar,
    MenuItem,
    IconButton,
    Card,
    CardContent,
    CardActions,
    Button,
    Tooltip
    // CircularProgress
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';

import { ChatUIProps } from "@/components/chat-ui/chat-ui";
import { withAuth } from '@/components/WithAuth';

import dynamic from 'next/dynamic'
// import { error } from 'console';

const DynamicChatUI = dynamic<ChatUIProps>(() => import('../../../components/chat-ui/chat-ui').then(mod => mod.ChatUI), {
    ssr: false,
});

const drawerWidth = 240;

type ListBedrockAgentsResponseType = {
    agentSummaries: {
        agentId: string;
        agentName: string;
        agentStatus: string;
        latestAgentVersion: string;
        updatedAt: string;
    }[];
}

type ListAgentIdsResponseType = {
    agentAliasSummaries:
    {
        agentAliasId: string,
        agentAliasName: string,
        agentAliasStatus: string,
        createdAt: string,
        description: string,
        routingConfiguration:
        {
            agentVersion: string,
            provisionedThroughput: string
        }[],
        updatedAt: string
    }[]
    ,
    nextToken: string
}

const invokeBedrockAgentParseBodyGetTextAndTrace = async (prompt: string, chatSession: Schema['ChatSession']['type']) => {
    console.log('Prompt: ', prompt)
    if (!chatSession.aiBotInfo?.aiBotAliasId) throw new Error('No Agent Alias ID found in invoke request')
    if (!chatSession.aiBotInfo?.aiBotId) throw new Error('No Agent ID found in invoke request')
    const response = await amplifyClient.queries.invokeBedrockAgent({
        prompt: prompt,
        agentId: chatSession.aiBotInfo?.aiBotId,
        agentAliasId: chatSession.aiBotInfo?.aiBotAliasId,
        chatSessionId: chatSession.id
    })
    console.log('Bedrock Agent Response: ', response.data)
    if (!(response.data)) {
        console.log('No response from bedrock agent after prompt: ', prompt)
        return
    }
    return {
        text: response.data.completion,
        trace: response.data.orchestrationTrace
    }
}

const setChatSessionFirstMessageSummary = async (firstMessageBody: string, targetChatSession: Schema['ChatSession']['type']) => {
    const outputStructure = {
        title: "SummarizeMessageIntnet",
        description: "Summarize the intent of the user's message?",
        type: "object",
        properties: {
            summary: {
                type: 'string',
                description: `Message intent summary in 20 characters or fewer.`,
                // maxLength: 20
            }
        },
        required: ['summary'],
    };

    const structuredResponse = await amplifyClient.queries.invokeBedrockWithStructuredOutput({
        chatSessionId: targetChatSession.id,
        lastMessageText: firstMessageBody,
        outputStructure: JSON.stringify(outputStructure)
    })
    console.log("Structured Output Response: ", structuredResponse)
    if (structuredResponse.data) {
        const messageIntentSummary = JSON.parse(structuredResponse.data).summary as string
        await amplifyClient.models.ChatSession.update({
            id: targetChatSession.id,
            firstMessageSummary: messageIntentSummary
        })
    } else console.log('No structured output found in response: ', structuredResponse)
}

const invokeProductionAgent = async (prompt: string, chatSession: Schema['ChatSession']['type']) => {
    amplifyClient.queries.invokeProductionAgent({ lastMessageText: prompt, chatSessionId: chatSession.id }).then(
        (response) => {
            console.log("bot response: ", response)
        }
    )
}

const getAgentAliasId = async (agentId: string) => {
    const response = await amplifyClient.queries.listBedrockAgentAliasIds({ agentId: agentId })
    console.log('get Agent Alias Id Response: ', response.data)
    if (!(response.data && response.data.body)) {
        console.log('No response getting Agent Alias ID for Agent ID ', agentId)
        return
    }
    const listAgnetAliasIdsResponseBody = JSON.parse(response.data.body) as ListAgentIdsResponseType
    //Get the most recently created AliasId
    const mostRecentAliasId = listAgnetAliasIdsResponseBody.agentAliasSummaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].agentAliasId

    return mostRecentAliasId
}

const combineAndSortMessages = ((arr1: Array<Schema["ChatMessage"]["type"]>, arr2: Array<Schema["ChatMessage"]["type"]>) => {
    const combinedMessages = [...arr1, ...arr2]
    const uniqueMessages = combinedMessages.filter((message, index, self) =>
        index === self.findIndex((p) => p.id === message.id)
    );
    return uniqueMessages.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) throw new Error("createdAt is missing")
        return a.createdAt.localeCompare(b.createdAt)
    });
})

function Page({ params }: { params?: { chatSessionId: string } }) {
    const [messages, setMessages] = useState<Array<Schema["ChatMessage"]["type"]>>([]);
    const [characterStreamMessage, setCharacterStreamMessage] = useState<Message>({ role: "ai", content: "", createdAt: new Date().toISOString() });
    const [chatSessions, setChatSessions] = useState<Array<Schema["ChatSession"]["type"]>>([]);
    const [activeChatSession, setActiveChatSession] = useState<Schema["ChatSession"]["type"]>();
    const [suggestedPrompts, setSuggestedPromptes] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false);
    const [bedrockAgents, setBedrockAgents] = useState<ListBedrockAgentsResponseType>();

    const { user } = useAuthenticator((context) => [context.user]);
    const router = useRouter();

    // //Set the chat session from params
    // useEffect(() => {
    //     if (params && params.chatSessionId) {
    //         amplifyClient.models.ChatSession.get({ id: params.chatSessionId }).then(({ data: chatSession }) => {
    //             if (chatSession) {
    //                 setActiveChatSession(chatSession)

    //                 console.log('Loaded chat session. Ai Bot Info:', chatSession.aiBotInfo)

    //             } else {
    //                 console.log(`Chat session ${params.chatSessionId} not found`)
    //             }
    //         })
    //     } else {
    //         console.log("No chat session id in params: ", params)
    //     }
    // }, [params])

    //Set the chat session from params and get updates as the chat session is updated
    useEffect(() => {
        if (params && params.chatSessionId) {
            amplifyClient.models.ChatSession.observeQuery({
                filter: {
                    // owner: { eq: user.userId }
                    id: { eq: params.chatSessionId }
                }
            }).subscribe({
                next: (data) => setActiveChatSession(data.items[0]),
                error: (error) => console.error('Error subscribing the chat session', error)
            })
        } else {
            console.log("No chat session id in params: ", params)
        }
    }, [params])

    // This runs when the chat session messages change
    // The blurb below sets the suggested prompts and the isLoading indicator
    useEffect(() => {
        console.log("Messages: ", messages)

        //Reset the character stream when we get a new message
        setCharacterStreamMessage(() => ({
            content: "",
            role: "ai",
            createdAt: new Date().toISOString()
        }))

        //Set the default prompts if this is the first message
        if (
            !messages.length && //No messages currently in the chat
            activeChatSession &&
            activeChatSession.aiBotInfo &&
            activeChatSession.aiBotInfo.aiBotId &&
            activeChatSession.aiBotInfo.aiBotId in defaultAgents
        ) setSuggestedPromptes(defaultAgents[activeChatSession.aiBotInfo.aiBotId].samplePrompts)

        //If there are no messages, or the last message is an AI message with no tool calls, prepare for a human message
        if (
            messages.length &&
            messages[messages.length - 1].role === "ai" &&
            (!messages[messages.length - 1].tool_calls || messages[messages.length - 1].tool_calls === "[]")

        ) {
            console.log('Ready for human response')
            setIsLoading(false)

            async function fetchAndSetSuggestedPrompts() {
                setSuggestedPromptes([])
                if (!activeChatSession || !activeChatSession.id) throw new Error("No active chat session")

                const suggestedPromptsResponse = await amplifyClient.queries.invokeBedrockWithStructuredOutput({
                    chatSessionId: activeChatSession?.id,
                    lastMessageText: "Suggest three follow up prompts",
                    outputStructure: JSON.stringify({
                        title: "RecommendNextPrompt",
                        description: "Help the user chose the next prompt to send.",
                        type: "object",
                        properties: {
                            suggestedPrompts: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                minItems: 3,
                                maxItems: 3,
                                description: `
                                Prompts to suggest to a user when interacting with a large language model
                                `
                            }
                        },
                        required: ['suggestedPrompts'],
                    })
                })
                console.log("Suggested Prompts Response: ", suggestedPromptsResponse)
                if (suggestedPromptsResponse.data) {
                    const newSuggestedPrompts = JSON.parse(suggestedPromptsResponse.data).suggestedPrompts as string[]
                    setSuggestedPromptes(newSuggestedPrompts)
                } else console.log('No suggested prompts found in response: ', suggestedPromptsResponse)
            }
            fetchAndSetSuggestedPrompts()
        } else if (messages.length) setIsLoading(true) //This is so if you re-load a page while the agent is processing is loading is set to true.

    }, [messages, activeChatSession])

    // List the user's chat sessions
    useEffect(() => {
        if (user) {
            amplifyClient.models.ChatSession.observeQuery({
                filter: {
                    // owner: { eq: user.userId }
                    owner: { contains: user.userId }
                }
            }).subscribe({
                next: (data) => setChatSessions(data.items)
            })
        }

    }, [user])

    // Subscribe to messages of the active chat session
    useEffect(() => {
        setMessages([])
        if (activeChatSession) {
            const sub = amplifyClient.models.ChatMessage.observeQuery({
                filter: {
                    chatSessionId: { eq: activeChatSession.id }
                }
            }).subscribe({
                next: ({ items }) => { //isSynced is an option here to
                    setMessages((prevMessages) => combineAndSortMessages(prevMessages, items))
                }
            }
            )
            return () => sub.unsubscribe();
        }

    }, [activeChatSession])

    // Subscribe to the token stream for this chat session
    useEffect(() => {
        if (activeChatSession) {
            const sub = amplifyClient.subscriptions.recieveResponseStreamChunk({ chatSessionId: activeChatSession.id }).subscribe({
                next: ({ chunk }) => {
                    // console.log('Message Stream Chunk: ', chunk)

                    setCharacterStreamMessage((prevStreamMessage) => ({
                        content: prevStreamMessage ? (prevStreamMessage.content || "") + chunk : chunk,
                        role: "ai",
                        createdAt: new Date().toISOString()
                    }))
                }
            }
            )
            return () => sub.unsubscribe();
        }

    }, [activeChatSession])

    // List the available bedrock agents
    useEffect(() => {
        const fetchListBedrockAgents = async () => {
            const response = await amplifyClient.queries.listBedrockAgents()
            console.log('List Agents Response: ', response.data)
            if (!(response.data && response.data.body)) {
                console.log('No response from listing bedrock agents')
                return
            }
            const listAgentsResponseBody = JSON.parse(response.data.body) as ListBedrockAgentsResponseType
            console.log('List Bedrock Agents Response Body: ', listAgentsResponseBody)
            setBedrockAgents(listAgentsResponseBody)
            // return listAgentsResponseBody
        }
        fetchListBedrockAgents()
    }, [])

    async function createChatSession(chatSession: Schema['ChatSession']['createType']) {
        setMessages([])
        amplifyClient.models.ChatSession.create(chatSession).then(({ data: newChatSession }) => {
            if (newChatSession) {
                router.push(`/chat/${newChatSession.id}`)

            }
        })
    }

    async function deleteChatSession(targetSession: Schema['ChatSession']['type']) {
        amplifyClient.models.ChatSession.delete({ id: targetSession.id })
        // Remove the target session from the list of chat sessions
        setChatSessions((previousChatSessions) => previousChatSessions.filter(existingSession => existingSession.id != targetSession.id))
    }

    function addChatMessage(props: { body: string, role: "human" | "ai" | "tool", trace?: string }) {
        const targetChatSessionId = activeChatSession?.id;

        if (targetChatSessionId) {
            return amplifyClient.models.ChatMessage.create({
                content: props.body,
                trace: props.trace,
                role: props.role,
                chatSessionId: targetChatSessionId
            })
        }
    }

    async function addUserChatMessage(body: string) {
        if (!messages.length) {
            console.log("This is the initial message. Getting summary for chat session")
            if (!activeChatSession) throw new Error("No active chat session")
            setChatSessionFirstMessageSummary(body, activeChatSession)
        }
        await addChatMessage({ body: body, role: "human" })
        sendMessageToChatBot(body);
    }

    async function sendMessageToChatBot(prompt: string) {
        setIsLoading(true);

        if (activeChatSession?.aiBotInfo?.aiBotAliasId) {
            const response = await invokeBedrockAgentParseBodyGetTextAndTrace(prompt, activeChatSession)
            if (!response) throw new Error("No response from agent");
        } else {
            switch (activeChatSession?.aiBotInfo?.aiBotName) {
                case defaultAgents.FoundationModel.name:
                    console.log("invoking the foundation model")
                    const responseText = await invokeBedrockModelParseBodyGetText(prompt)
                    if (!responseText) throw new Error("No response from agent");
                    addChatMessage({ body: responseText, role: "ai" })
                    break
                case defaultAgents.ProductionAgent.name:
                    await invokeProductionAgent(prompt, activeChatSession)
                    break;
                case defaultAgents.PlanAndExecuteAgent.name:
                    const planAndExecuteResponse = await amplifyClient.queries.invokePlanAndExecuteAgent({ lastMessageText: prompt, chatSessionId: activeChatSession.id })
                    console.log('Plan and execute response: ', planAndExecuteResponse)
                    break;
                default:
                    throw new Error("No Agent Configured");
                    break;
            }
        }




        // else if (activeChatSession?.aiBotInfo?.aiBotName === defaultAgents.FoundationModel.name) {
        //     console.log("invoking the foundation model")
        //     const responseText = await invokeBedrockModelParseBodyGetText(prompt)
        //     if (!responseText) throw new Error("No response from agent");
        //     addChatMessage({ body: responseText, role: "ai" })
        // } else if (activeChatSession?.aiBotInfo?.aiBotName === defaultAgents.ProductionAgent.name) {
        //     await invokeProductionAgent(prompt, activeChatSession)
        // } else if (activeChatSession?.aiBotInfo?.aiBotName === defaultAgents.PlanAndExecuteAgent.name) {
        //     const planAndExecuteResponse = await amplifyClient.queries.invokePlanAndExecuteAgent({ lastMessageText: prompt, chatSessionId: activeChatSession.id })
        //     console.log('Plan and execute response: ', planAndExecuteResponse)
        // } else {
        //     throw new Error("No Agent Configured");
        // }

        // console.log('Response Text: ', responseText)
        // if (!responseText) throw new Error("No response from agent");


        // addChatMessage(responseText, "ai")
    }

    return (
        // <Box>
        <AddSideBar
            // initiallyOpen={(activeChatSession?.aiBotInfo?.aiBotName === defaultAgents.PlanAndExecuteAgent.name)} // Only open the side bar if the plan and execute agent is open
            initiallyOpen={false}
            anchor="right"
            drawerContent={
                <>
                    <Typography variant="h5" sx={{ textAlign: 'center' }}>Plan and execute steps:</Typography>
                    {activeChatSession?.pastSteps?.map((step) => {
                        try {
                            const stepContent = JSON.parse(step as string)
                            return (
                                <Tooltip
                                    key={step as string}
                                    title={<pre
                                        style={{ //Wrap long lines
                                            whiteSpace: 'pre-wrap',
                                            wordWrap: 'break-word',
                                            overflowWrap: 'break-word',
                                        }}
                                    >
                                        {stringify(stepContent)}
                                    </pre>}
                                    arrow
                                    placement="left"
                                    slotProps={{
                                        tooltip: {
                                            sx: {
                                                maxWidth: 800,
                                            },
                                        },
                                    }}
                                >
                                    <Card key={step as string} sx={{ marginBottom: 2, backgroundColor: '#e3f2fd', flexShrink: 0 }}>
                                        <CardContent>
                                            <Typography variant="h6" component="div">
                                                {stepContent.title}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Tooltip>
                            )
                        } catch {
                            return <p>{step}</p>
                        }
                    })}
                    {activeChatSession?.planSteps?.map((step) => {
                        try {
                            const { result, ...stepContent } = JSON.parse(step as string)// Remove the result if it exists from the plan steps
                            console.info(result)//TODO: remove this
                            return (
                                <Tooltip
                                    key={step as string}
                                    title={<pre
                                        style={{ //Wrap long lines
                                            whiteSpace: 'pre-wrap',
                                            wordWrap: 'break-word',
                                            overflowWrap: 'break-word',
                                        }}
                                    >
                                        {stringify(stepContent)}
                                    </pre>}
                                    arrow
                                    placement="left"
                                    slotProps={{
                                        tooltip: {
                                            sx: {
                                                maxWidth: 800,
                                            },
                                        },
                                    }}
                                >
                                    <Card key={step as string} sx={{ marginBottom: 2, backgroundColor: '#f5f5f5', flexShrink: 0 }}>
                                        <CardContent>
                                            <Typography variant="h6" component="div">
                                                {stepContent.title}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Tooltip>

                            )
                        } catch {
                            return <p>{step}</p>
                        }
                    })}
                </>

            }
        >
            <Drawer
                anchor='left'
                open={true}
                variant="persistent"
                sx={{
                    width: drawerWidth,
                    // flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' }
                }}
            >
                <Toolbar />
                {/* <Typography sx={{ textAlign: 'center' }}>Chatting with {activeChatSession?.aiBotInfo?.aiBotName} Alias Id: {activeChatSession?.aiBotInfo?.aiBotAliasId}</Typography> */}
                <Box sx={{ overflow: 'auto' }}>
                    <DropdownMenu buttonText='New Chat Session'>
                        {
                            [
                                ...Object.entries(defaultAgents).map(([agentId, agentInfo]) => ({ agentId: agentId, agentName: agentInfo.name })),
                                ...bedrockAgents?.agentSummaries.filter((agent) => (agent.agentStatus === "PREPARED")) || []
                            ]
                                .map((agent) => (
                                    <MenuItem
                                        key={agent.agentName}
                                        onClick={async () => {
                                            const agentAliasId = agent.agentId && !(agent.agentId in defaultAgents) ? await getAgentAliasId(agent.agentId) : null
                                            createChatSession({ aiBotInfo: { aiBotName: agent.agentName, aiBotId: agent.agentId, aiBotAliasId: agentAliasId } })
                                        }}
                                    >
                                        <Typography sx={{ textAlign: 'center' }}>{agent.agentName}</Typography>
                                    </MenuItem>
                                ))
                        }
                    </DropdownMenu>


                    <Typography sx={{ textAlign: 'center' }}>My Chat Sessions:</Typography>
                    {chatSessions
                        .slice()
                        .sort((a, b) => {
                            if (!a.createdAt || !b.createdAt) throw new Error("createdAt is missing")
                            return a.createdAt < b.createdAt ? 1 : -1
                        })
                        .map((session) => (

                            <Card key={session.id} sx={{ marginBottom: 2, backgroundColor: '#f5f5f5', flexShrink: 0 }}>
                                <CardContent>
                                    <Typography variant="h6" component="div" noWrap>
                                        {session.firstMessageSummary?.slice(0, 50)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {formatDate(session.createdAt)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                        AI: {session.aiBotInfo?.aiBotName || 'Unknown'}
                                    </Typography>
                                </CardContent>
                                <CardActions>
                                    <Button
                                        size="small"
                                        onClick={() => router.push(`/chat/${session.id}`)}
                                    >
                                        Open Chat
                                    </Button>
                                    <IconButton
                                        aria-label="delete"
                                        onClick={() => deleteChatSession(session)}
                                        sx={{ marginLeft: 'auto' }}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </CardActions>
                            </Card>
                        ))
                    }
                </Box>
            </Drawer>
            {params ? //Show the chat UI if there is an active chat session
                <div style={{ marginLeft: '210px', padding: '20px' }}>
                    <Box>
                        <Toolbar />

                        <Box>
                            <Typography variant="h4" gutterBottom>
                                Chat with {activeChatSession?.aiBotInfo?.aiBotName}
                            </Typography>
                        </Box>
                        <Box>

                            <DynamicChatUI
                                onSendMessage={addUserChatMessage}
                                messages={[
                                    ...messages,
                                    ...(characterStreamMessage.content !== "" ? [characterStreamMessage] : [])
                                ]}
                                running={isLoading}
                            />


                        </Box>
                        <Box sx={{ mt: 5 }}>
                            {
                                !isLoading && (suggestedPrompts.length || !messages.length) ? (
                                    <Typography variant="body2">
                                        Suggested Follow Ups:
                                    </Typography>
                                ) : (
                                    null
                                    // <CircularProgress />
                                )
                            }
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {!isLoading && suggestedPrompts.map((prompt) => (
                                <div key={prompt}>
                                    <Button onClick={() => addUserChatMessage(prompt)} >
                                        {prompt}
                                    </Button>
                                </div>
                            ))
                            }
                        </Box>
                    </Box>
                </div>
                : null}
        </AddSideBar>
        // </Box>

    );
};

export default withAuth(Page)
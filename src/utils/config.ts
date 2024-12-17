type defaultAgent = {
    name: string,
    samplePrompts: string[]
    invokeFieldName?: string
}

export const defaultAgents: { [key: string]: defaultAgent } = {
    ProductionAgent: {
        name: "Production Agent",
        invokeFieldName: "invokeProductionAgent",
        samplePrompts: [
            `Search the well files for the well with API number 30-045-29202 to make a table with type of operation (drilling, completion, workover, plugging, other), text from the report describing operational details, and document title.
            Also execute a sql query to get the total monthly oil, gas and water production from this well.
            Create a plot with both the event data and the production data. `.replace(/^\s+/gm, ''), //This trims the white space at the start of each line
            `Plot the total monthly oil, gas, and water production since 1900 for the well with API number 30-045-29202`
        ]
    },
    FoundationModel: {
        name: "Foundation Model",
        samplePrompts: [
            "What portion of world oil production does the US produce?"
        ]
    },
    PlanAndExecuteAgent: {
        name: "Plan And Execute",
        samplePrompts: [
            `This morning well with API number 30-045-29202 fell in production to 10 MCFD with indication of a hole in tubing at 1000'. 
            Make a table of all operational events found in the well files. 
            Query all historic monthly production rates and make a plot with both the event and production data. 
            Write a procedure to repair the well, estimate the cost of the repair, and forecast the financial returns. 
            Make an executive report about repairing the well with detailed cost and procedure data. 
            Use the ai role for all steps.
            `.replace(/^\s+/gm, ''),
            `Where should I go on vacation?`
        ]
    },
}
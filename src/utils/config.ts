type defaultAgent = {
    name: string,
    samplePrompts: string[]
}

export const defaultAgents: {[key: string]: defaultAgent} = {
    "ProductionAgent": {
        name: "Production Agent",
        samplePrompts: [
        "I'm making an operational history for a well with API number 30-039-07715. The history should show events like drilling the well, completing a zone, repairing artificial lift, and other events which impact the wellbore. Make a table showing the type of operation, text from the report describing operational details, and document title. Exclude information about changes in the transportation corporation or cathotic protection."
    ]
}
}
// import { BedrockAgent } from "@aws-sdk/client-bedrock-agent"
import outputs from '@/../amplify_outputs.json';

type BaseAgent = {
    name: string
    samplePrompts: string[]
    source: 'bedrockAgent' | 'graphql'
}

export type BedrockAgent = BaseAgent & {
    source: "bedrockAgent"
    agentId: string
    agentAliasId: string
}

export type LangGraphAgent = BaseAgent & {
    source: "graphql"
    invokeFieldName: string
}

export const defaultAgents: { [key: string]: BaseAgent | BedrockAgent | LangGraphAgent } = {
    PlanAndExecuteAgent: {
        name: `Production Agent`,
        source: `graphql`,
        samplePrompts: [
            `今朝、API 番号 30-045-29202 の井戸が、配管に穴が開いているためガスの生産を停止しました。
            井戸ファイルで見つかったすべての運用イベントのテーブルを作成してください。
            過去のすべての月間生産率を照会し、イベントと生産データの両方を使用してプロットを作成してください。
            井戸の残りの生産量を見積もってください。
            井戸を修復する手順を記述し、修復コストを見積もり、財務指標を計算してください。
            詳細なコストと手順データを含む井戸の修復に関するエグゼクティブ レポートを作成してください。
            すべての手順で ai role を使用します。
            `.replace(/^\s+/gm, ''),
            `API 番号 30-045-29202 の井戸の井戸ファイルを検索し、操作の種類 (掘削、完了、作業オーバー、プラギング、その他)、運用の詳細を説明するレポートのテキスト、およびドキュメント タイトルを含むテーブルを作成してください。
            また、SQL クエリを実行して、この井戸からの月間総石油、ガス、および水生産量を取得してください。
            イベント データと生産データの両方を使用してプロットを作成してください。`.replace(/^\s+/gm, ''), //各行の先頭の空白をトリミングします
            `API 番号 30-045-29202 の井戸の 1900 年以降の月間石油、ガス、水の総生産量をプロットしてください`,
            `私の性格に最も合う人工リフトの形式はどれですか?`
            // `This morning well with API number 30-045-29202 stopped producing gas with indication of a hole in tubing.  
            // Make a table of all operational events found in the well files. 
            // Query all historic monthly production rates and make a plot with both the event and production data. 
            // Estimate the value of the well's remaining production. 
            // Write a procedure to repair the well, estimate the cost of the repair, and calculate financial metrics. 
            // Make an executive report about repairing the well with detailed cost and procedure data. 
            // Use the ai role for all steps.
            // `.replace(/^\s+/gm, ''),
            // `Search the well files for the well with API number 30-045-29202 to make a table with type of operation (drilling, completion, workover, plugging, other), text from the report describing operational details, and document title.
            // Also execute a sql query to get the total monthly oil, gas and water production from this well.
            // Create a plot with both the event data and the production data. `.replace(/^\s+/gm, ''), //This trims the white space at the start of each line
            // `Plot the total monthly oil, gas, and water production since 1900 for the well with API number 30-045-29202`,
            // `Which form of artifical lift best matches my personality?`
        ]
    },
    MaintenanceAgent: {
        name: "Maintenance Agent",
        source: "bedrockAgent",
        agentId: outputs.custom.maintenanceAgentId,
        agentAliasId: outputs.custom.maintenanceAgentAliasId,
        samplePrompts: [
            "Biodiesel Unit には tank がいくつありますか？",
            "2024 年 9 月に Biodiesel Unit で発生した主なインシデントと対応策は何ですか？"
            //"How many tanks are in my biodiesel unit?",
            //"In September 2024, what are a few key incidents and actions taken at the biodiesel unit?",
        ],
    } as BedrockAgent,
    RegulatoryAgent: {
        name: "Regulatory Agent",
        source: "bedrockAgent",
        agentId: outputs.custom.regulatoryAgentId,
        agentAliasId: outputs.custom.regulatoryAgentAliasId,
        samplePrompts: [
            "米国における漏えい排出物の監視と報告の要件は何ですか？",
            "ブラジルの沖合油井の廃止の要件は何ですか？",
            //"What are the requirements for fugitive emissions monitoring and reporting in the U.S.?",
            //"What are the requirements for decomissioning an offshore oil well in Brazil?",
        ],
    } as BedrockAgent,
    PetrophysicsAgent: {
        name: "Petrophysics Agent",
        source: "bedrockAgent",
        agentId: outputs.custom.petrophysicsAgentId,
        agentAliasId: outputs.custom.petrophysicsAgentAliasId,
        samplePrompts: [
            "岩石物理学は石油とガスの生産にどのように影響しますか？",
            "Vp が 3200 m/s、Vs が 1800 m/s、密度が 2.4 g/cc の頁岩で覆われた、25% の多孔度を持つガス飽和砂岩の予想される AVO クラスを計算してください。"
            //"How does rock physics affect oil and gas production?",
            //"Calculate the expected AVO Class for a gas saturated sandstone with 25% porosity, overlain by shale with Vp of 3200 m/s, Vs of 1800 m/s, and density of 2.4 g/cc"
        ],
    } as BedrockAgent
}
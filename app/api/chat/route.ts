// 1. Import dependencies
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { StreamingTextResponse } from 'ai';
import * as z from 'zod';

// 2. Define interfaces
interface File {
  base64: string;
  content: string;
}
interface FunctionInfo {
  name: string;
  active: boolean;
}

// 3. Set up environment variables
const privateKey: string = process.env.SUPABASE_PRIVATE_KEY!;
const url: string = process.env.SUPABASE_URL!;
if (!privateKey) throw new Error(`Expected env var SUPABASE_PRIVATE_KEY`);
if (!url) throw new Error(`Expected env var SUPABASE_URL`);

// 4. Define the POST function
export async function POST(req: Request, res: Response) {
  // 5. Extract data from the request
  const { messages, functions, files, selectedModel, selectedVectorStorage } = await req.json();

    // 8. Process the input data
  const latestMessage: string = messages[messages.length - 1].content;
  const decodedFiles: File[] = files.map((file: { base64: string }) => {
    return {
      ...file,
      content: Buffer.from(file.base64, 'base64').toString('utf-8')
    };
  });

  let argForExecutor: string = latestMessage;
  if (files.length > 0) {
    // 9. Set up Supabase vector store for file content
    const client = createClient(url, privateKey);
    const string: string = decodedFiles.map((file) => file.content).join('\n');
    const vectorStore = await SupabaseVectorStore.fromTexts(
      [string],
      [],
      new OpenAIEmbeddings(),
      {
        client,
        tableName: "documents",
        queryName: "match_documents",
      }
    );
    // 10. Perform similarity search using vector store
    const vectorResultsArr = await vectorStore.similaritySearch(latestMessage, 3);
    const vectorResultsStr: string = vectorResultsArr.map((result) => result.pageContent).join('\n');
    argForExecutor = `USER QUERY: ${latestMessage} --- Before using prior knowledge base, use the following from new info: ${vectorResultsStr}`;
  }

  // 11. Set up agent executor with tools and model
  const model = new ChatOpenAI({ temperature: 0, streaming: true });

  // 15. Initialize agent executor with tools and model
  const executor = await initializeAgentExecutorWithOptions([], model, {
    agentType: "openai-functions",
  });

  // 16. Run the executor and return the result as a streaming response
  const result: string = await executor.run(argForExecutor);
  const chunks: string[] = result.split(" ");
  const responseStream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        const bytes = new TextEncoder().encode(chunk + " ");
        controller.enqueue(bytes);
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20 + 10)));
      }
      controller.close();
    },
  });
  return new StreamingTextResponse(responseStream);
}

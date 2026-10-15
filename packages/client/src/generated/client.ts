import type {
  HealthGetOutput,
  LocationGetInput,
  LocationGetOutput,
  AgentsListInput,
  AgentsListOutput,
  SessionsListInput,
  SessionsListOutput,
  SessionsCreateInput,
  SessionsCreateOutput,
  SessionsActiveOutput,
  SessionsGetInput,
  SessionsGetOutput,
  SessionsSwitchAgentInput,
  SessionsSwitchAgentOutput,
  SessionsSwitchModelInput,
  SessionsSwitchModelOutput,
  SessionsPromptInput,
  SessionsPromptOutput,
  SessionsCompactInput,
  SessionsCompactOutput,
  SessionsWaitInput,
  SessionsWaitOutput,
  SessionsStageInput,
  SessionsStageOutput,
  SessionsClearInput,
  SessionsClearOutput,
  SessionsCommitInput,
  SessionsCommitOutput,
  SessionsContextInput,
  SessionsContextOutput,
  SessionsHistoryInput,
  SessionsHistoryOutput,
  SessionsEventsInput,
  SessionsEventsOutput,
  SessionsInterruptInput,
  SessionsInterruptOutput,
  SessionsMessageInput,
  SessionsMessageOutput,
  MessagesListInput,
  MessagesListOutput,
  ModelsListInput,
  ModelsListOutput,
  ProvidersListInput,
  ProvidersListOutput,
  ProvidersGetInput,
  ProvidersGetOutput,
  IntegrationsListInput,
  IntegrationsListOutput,
  IntegrationsGetInput,
  IntegrationsGetOutput,
  IntegrationsConnectKeyInput,
  IntegrationsConnectKeyOutput,
  IntegrationsConnectOauthInput,
  IntegrationsConnectOauthOutput,
  IntegrationsAttemptStatusInput,
  IntegrationsAttemptStatusOutput,
  IntegrationsAttemptCompleteInput,
  IntegrationsAttemptCompleteOutput,
  IntegrationsAttemptCancelInput,
  IntegrationsAttemptCancelOutput,
  CredentialsUpdateInput,
  CredentialsUpdateOutput,
  CredentialsRemoveInput,
  CredentialsRemoveOutput,
  PermissionsListRequestsInput,
  PermissionsListRequestsOutput,
  PermissionsListSavedInput,
  PermissionsListSavedOutput,
  PermissionsRemoveSavedInput,
  PermissionsRemoveSavedOutput,
  PermissionsCreateInput,
  PermissionsCreateOutput,
  PermissionsListInput,
  PermissionsListOutput,
  PermissionsGetInput,
  PermissionsGetOutput,
  PermissionsReplyInput,
  PermissionsReplyOutput,
  FilesListInput,
  FilesListOutput,
  FilesFindInput,
  FilesFindOutput,
  CommandsListInput,
  CommandsListOutput,
  SkillsListInput,
  SkillsListOutput,
  EventsSubscribeOutput,
  PtysListInput,
  PtysListOutput,
  PtysCreateInput,
  PtysCreateOutput,
  PtysGetInput,
  PtysGetOutput,
  PtysUpdateInput,
  PtysUpdateOutput,
  PtysRemoveInput,
  PtysRemoveOutput,
  QuestionsListRequestsInput,
  QuestionsListRequestsOutput,
  QuestionsListInput,
  QuestionsListOutput,
  QuestionsReplyInput,
  QuestionsReplyOutput,
  QuestionsRejectInput,
  QuestionsRejectOutput,
  ReferencesListInput,
  ReferencesListOutput,
  ProjectCopiesCreateInput,
  ProjectCopiesCreateOutput,
  ProjectCopiesRemoveInput,
  ProjectCopiesRemoveOutput,
  ProjectCopiesRefreshInput,
  ProjectCopiesRefreshOutput,
  ServerResearchosAssetsFileReadInput,
  ServerResearchosAssetsFileReadOutput,
  ServerResearchosAssetsListInput,
  ServerResearchosAssetsListOutput,
  ServerResearchosAssetsStatsInput,
  ServerResearchosAssetsStatsOutput,
  ServerResearchosAssetsTestInput,
  ServerResearchosAssetsTestOutput,
  ServerResearchosAssetsFileWriteInput,
  ServerResearchosAssetsFileWriteOutput,
  ServerResearchosAssetsNoteWriteInput,
  ServerResearchosAssetsNoteWriteOutput,
  ServerResearchosAssetsPresetInstallInput,
  ServerResearchosAssetsPresetInstallOutput,
  ServerResearchosLiteratureSearchInput,
  ServerResearchosLiteratureSearchOutput,
  ServerResearchosLiteratureListInput,
  ServerResearchosLiteratureListOutput,
  ServerResearchosLiteratureGetInput,
  ServerResearchosLiteratureGetOutput,
  ServerResearchosLiteratureExportInput,
  ServerResearchosLiteratureExportOutput,
  ServerResearchosLiteratureImportInput,
  ServerResearchosLiteratureImportOutput,
  ServerResearchosLiteratureCitationsInput,
  ServerResearchosLiteratureCitationsOutput,
  ServerResearchosLiteratureSimilarInput,
  ServerResearchosLiteratureSimilarOutput,
  ServerResearchosLiteratureReadInput,
  ServerResearchosLiteratureReadOutput,
  ServerResearchosLiteratureUpdateInput,
  ServerResearchosLiteratureUpdateOutput,
  ServerResearchosLiteratureSelectInput,
  ServerResearchosLiteratureSelectOutput,
  ServerResearchosGraphStatusInput,
  ServerResearchosGraphStatusOutput,
  ServerResearchosGraphGetInput,
  ServerResearchosGraphGetOutput,
  ServerResearchosGraphNodeInput,
  ServerResearchosGraphNodeOutput,
  ServerResearchosGraphAskInput,
  ServerResearchosGraphAskOutput,
  ServerResearchosGraphReindexInput,
  ServerResearchosGraphReindexOutput,
  ServerResearchosGraphSaveLayoutInput,
  ServerResearchosGraphSaveLayoutOutput,
  ServerResearchosLatexFilesInput,
  ServerResearchosLatexFilesOutput,
  ServerResearchosLatexSourceInput,
  ServerResearchosLatexSourceOutput,
  ServerResearchosLatexSourceWriteInput,
  ServerResearchosLatexSourceWriteOutput,
  ServerResearchosLatexPdfInput,
  ServerResearchosLatexPdfOutput,
  ServerResearchosLatexBuildsInput,
  ServerResearchosLatexBuildsOutput,
  ServerResearchosLatexCompileInput,
  ServerResearchosLatexCompileOutput,
  ServerResearchosLatexSynctexInput,
  ServerResearchosLatexSynctexOutput,
  ServerResearchosLatexFormatCheckInput,
  ServerResearchosLatexFormatCheckOutput,
  ServerResearchosWritingTableToLatexInput,
  ServerResearchosWritingTableToLatexOutput,
  ServerResearchosWritingMdToLatexInput,
  ServerResearchosWritingMdToLatexOutput,
  ServerResearchosWritingDiffInput,
  ServerResearchosWritingDiffOutput,
  ServerResearchosWritingApplyDiffInput,
  ServerResearchosWritingApplyDiffOutput,
  ServerResearchosWritingBibtexFromLibraryInput,
  ServerResearchosWritingBibtexFromLibraryOutput,
  ServerResearchosWritingBibtexUpsertInput,
  ServerResearchosWritingBibtexUpsertOutput,
  ServerResearchosWritingSuggestionRecordInput,
  ServerResearchosWritingSuggestionRecordOutput,
  ServerResearchosWritingSuggestionsInput,
  ServerResearchosWritingSuggestionsOutput,
  ServerResearchosDataNotebooksInput,
  ServerResearchosDataNotebooksOutput,
  ServerResearchosDataCellsInput,
  ServerResearchosDataCellsOutput,
  ServerResearchosDataCellCreateInput,
  ServerResearchosDataCellCreateOutput,
  ServerResearchosDataCellSaveInput,
  ServerResearchosDataCellSaveOutput,
  ServerResearchosDataCellRunInput,
  ServerResearchosDataCellRunOutput,
  ServerResearchosDataDatasetsInput,
  ServerResearchosDataDatasetsOutput,
  ServerResearchosDataArtifactsInput,
  ServerResearchosDataArtifactsOutput,
  ServerResearchosDataArtifactInput,
  ServerResearchosDataArtifactOutput,
  ServerResearchosDataArtifactFileInput,
  ServerResearchosDataArtifactFileOutput,
  ServerResearchosDataStatTestsInput,
  ServerResearchosDataStatTestsOutput,
  ServerResearchosDataLinkInput,
  ServerResearchosDataLinkOutput,
  ServerResearchosDataDatasetRegisterInput,
  ServerResearchosDataDatasetRegisterOutput,
  ServerResearchosPlotCreateInput,
  ServerResearchosPlotCreateOutput,
  ServerResearchosPlotTuneInput,
  ServerResearchosPlotTuneOutput,
  ServerResearchosPlotAnnotateSignificanceInput,
  ServerResearchosPlotAnnotateSignificanceOutput,
  ServerResearchosPlotMermaidInput,
  ServerResearchosPlotMermaidOutput,
  ServerResearchosPlotGraphvizInput,
  ServerResearchosPlotGraphvizOutput,
  ServerResearchosPlotDiagramInput,
  ServerResearchosPlotDiagramOutput,
  ServerResearchosPlotDiagramSaveInput,
  ServerResearchosPlotDiagramSaveOutput,
  ServerResearchosPlotInsertToPaperInput,
  ServerResearchosPlotInsertToPaperOutput,
  ServerResearchosPlotArtifactsInput,
  ServerResearchosPlotArtifactsOutput,
  ServerResearchosPlotArtifactFileInput,
  ServerResearchosPlotArtifactFileOutput,
  ServerResearchosReproduceListInput,
  ServerResearchosReproduceListOutput,
  ServerResearchosReproduceCreateInput,
  ServerResearchosReproduceCreateOutput,
  ServerResearchosReproduceGetInput,
  ServerResearchosReproduceGetOutput,
  ServerResearchosReproduceAdvanceInput,
  ServerResearchosReproduceAdvanceOutput,
  ServerResearchosReproduceMetricsSubmitInput,
  ServerResearchosReproduceMetricsSubmitOutput,
  ServerResearchosReproduceComparisonInput,
  ServerResearchosReproduceComparisonOutput,
  ServerResearchosReproduceIssuesInput,
  ServerResearchosReproduceIssuesOutput,
  ServerResearchosReproduceCancelInput,
  ServerResearchosReproduceCancelOutput,
  ServerResearchosTranslateRunInput,
  ServerResearchosTranslateRunOutput,
  ServerResearchosTranslateGetInput,
  ServerResearchosTranslateGetOutput,
} from "./types"
import { ClientError } from "./client-error"

export interface ClientOptions {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly headers?: HeadersInit
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

interface RequestDescriptor {
  readonly method: string
  readonly path: string
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, unknown>
  readonly body?: unknown
  readonly successStatus: number
  readonly declaredStatuses: ReadonlyArray<number>
  readonly empty: boolean
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
  }

  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    try {
      const prepared = prepare(descriptor, requestOptions)
      return await fetch(prepared.url, prepared.init)
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return undefined as A
    }
    return (await json(response)) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
      }
      if (response.body === null) throw new ClientError("MalformedResponse")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          let next
          try {
            next = await reader.read()
          } catch (cause) {
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          if (trailingCarriageReturn) buffer += "\r"
          if (next.done && buffer !== "") buffer += "\n\n"
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split("\n")
              .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
              .join("\n")
            if (data !== "") {
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      get: (requestOptions?: RequestOptions) =>
        request<HealthGetOutput>(
          { method: "GET", path: `/api/health`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    location: {
      get: (input?: LocationGetInput, requestOptions?: RequestOptions) =>
        request<LocationGetOutput>(
          {
            method: "GET",
            path: `/api/location`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    agents: {
      list: (input?: AgentsListInput, requestOptions?: RequestOptions) =>
        request<AgentsListOutput>(
          {
            method: "GET",
            path: `/api/agent`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    sessions: {
      list: (input?: SessionsListInput, requestOptions?: RequestOptions) =>
        request<SessionsListOutput>(
          {
            method: "GET",
            path: `/api/session`,
            query: {
              workspace: input?.["workspace"],
              limit: input?.["limit"],
              order: input?.["order"],
              search: input?.["search"],
              directory: input?.["directory"],
              project: input?.["project"],
              subpath: input?.["subpath"],
              cursor: input?.["cursor"],
            },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: SessionsCreateInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsCreateOutput }>(
          {
            method: "POST",
            path: `/api/session`,
            body: {
              id: input?.["id"],
              agent: input?.["agent"],
              model: input?.["model"],
              location: input?.["location"],
            },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      active: (requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsActiveOutput }>(
          {
            method: "GET",
            path: `/api/session/active`,
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      get: (input: SessionsGetInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsGetOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      switchAgent: (input: SessionsSwitchAgentInput, requestOptions?: RequestOptions) =>
        request<SessionsSwitchAgentOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/agent`,
            body: { agent: input["agent"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      switchModel: (input: SessionsSwitchModelInput, requestOptions?: RequestOptions) =>
        request<SessionsSwitchModelOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/model`,
            body: { model: input["model"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      prompt: (input: SessionsPromptInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsPromptOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/prompt`,
            body: { id: input["id"], prompt: input["prompt"], delivery: input["delivery"], resume: input["resume"] },
            successStatus: 200,
            declaredStatuses: [409, 404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      compact: (input: SessionsCompactInput, requestOptions?: RequestOptions) =>
        request<SessionsCompactOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/compact`,
            successStatus: 204,
            declaredStatuses: [404, 503, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      wait: (input: SessionsWaitInput, requestOptions?: RequestOptions) =>
        request<SessionsWaitOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/wait`,
            successStatus: 204,
            declaredStatuses: [404, 503, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      stage: (input: SessionsStageInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsStageOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/stage`,
            body: { messageID: input["messageID"], files: input["files"] },
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      clear: (input: SessionsClearInput, requestOptions?: RequestOptions) =>
        request<SessionsClearOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/clear`,
            successStatus: 204,
            declaredStatuses: [404, 500, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      commit: (input: SessionsCommitInput, requestOptions?: RequestOptions) =>
        request<SessionsCommitOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/commit`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      context: (input: SessionsContextInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsContextOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/context`,
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      history: (input: SessionsHistoryInput, requestOptions?: RequestOptions) =>
        request<SessionsHistoryOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/history`,
            query: { limit: input["limit"], after: input["after"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      events: (input: SessionsEventsInput, requestOptions?: RequestOptions): AsyncIterable<SessionsEventsOutput> =>
        sse<SessionsEventsOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/event`,
            query: { after: input["after"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      interrupt: (input: SessionsInterruptInput, requestOptions?: RequestOptions) =>
        request<SessionsInterruptOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/interrupt`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      message: (input: SessionsMessageInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsMessageOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
    },
    messages: {
      list: (input: MessagesListInput, requestOptions?: RequestOptions) =>
        request<MessagesListOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/message`,
            query: { limit: input["limit"], order: input["order"], cursor: input["cursor"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    models: {
      list: (input?: ModelsListInput, requestOptions?: RequestOptions) =>
        request<ModelsListOutput>(
          {
            method: "GET",
            path: `/api/model`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    providers: {
      list: (input?: ProvidersListInput, requestOptions?: RequestOptions) =>
        request<ProvidersListOutput>(
          {
            method: "GET",
            path: `/api/provider`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ProvidersGetInput, requestOptions?: RequestOptions) =>
        request<ProvidersGetOutput>(
          {
            method: "GET",
            path: `/api/provider/${encodeURIComponent(input.providerID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [404, 503, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    integrations: {
      list: (input?: IntegrationsListInput, requestOptions?: RequestOptions) =>
        request<IntegrationsListOutput>(
          {
            method: "GET",
            path: `/api/integration`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: IntegrationsGetInput, requestOptions?: RequestOptions) =>
        request<IntegrationsGetOutput>(
          {
            method: "GET",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      connectKey: (input: IntegrationsConnectKeyInput, requestOptions?: RequestOptions) =>
        request<IntegrationsConnectKeyOutput>(
          {
            method: "POST",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/key`,
            query: { location: input["location"] },
            body: { key: input["key"], label: input["label"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      connectOauth: (input: IntegrationsConnectOauthInput, requestOptions?: RequestOptions) =>
        request<IntegrationsConnectOauthOutput>(
          {
            method: "POST",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth`,
            query: { location: input["location"] },
            body: { methodID: input["methodID"], inputs: input["inputs"], label: input["label"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      attemptStatus: (input: IntegrationsAttemptStatusInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptStatusOutput>(
          {
            method: "GET",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      attemptComplete: (input: IntegrationsAttemptCompleteInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptCompleteOutput>(
          {
            method: "POST",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}/complete`,
            query: { location: input["location"] },
            body: { code: input["code"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      attemptCancel: (input: IntegrationsAttemptCancelInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptCancelOutput>(
          {
            method: "DELETE",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [401, 400],
            empty: true,
          },
          requestOptions,
        ),
    },
    credentials: {
      update: (input: CredentialsUpdateInput, requestOptions?: RequestOptions) =>
        request<CredentialsUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
            query: { location: input["location"] },
            body: { label: input["label"] },
            successStatus: 204,
            declaredStatuses: [401, 400],
            empty: true,
          },
          requestOptions,
        ),
      remove: (input: CredentialsRemoveInput, requestOptions?: RequestOptions) =>
        request<CredentialsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [401, 400],
            empty: true,
          },
          requestOptions,
        ),
    },
    permissions: {
      listRequests: (input?: PermissionsListRequestsInput, requestOptions?: RequestOptions) =>
        request<PermissionsListRequestsOutput>(
          {
            method: "GET",
            path: `/api/permission/request`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      listSaved: (input?: PermissionsListSavedInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsListSavedOutput }>(
          {
            method: "GET",
            path: `/api/permission/saved`,
            query: { projectID: input?.["projectID"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      removeSaved: (input: PermissionsRemoveSavedInput, requestOptions?: RequestOptions) =>
        request<PermissionsRemoveSavedOutput>(
          {
            method: "DELETE",
            path: `/api/permission/saved/${encodeURIComponent(input.id)}`,
            successStatus: 204,
            declaredStatuses: [401, 400],
            empty: true,
          },
          requestOptions,
        ),
      create: (input: PermissionsCreateInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsCreateOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
            body: {
              id: input["id"],
              action: input["action"],
              resources: input["resources"],
              save: input["save"],
              metadata: input["metadata"],
              source: input["source"],
              agent: input["agent"],
            },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      list: (input: PermissionsListInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsListOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      get: (input: PermissionsGetInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsGetOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      reply: (input: PermissionsReplyInput, requestOptions?: RequestOptions) =>
        request<PermissionsReplyOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply`,
            body: { reply: input["reply"], message: input["message"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    files: {
      list: (input?: FilesListInput, requestOptions?: RequestOptions) =>
        request<FilesListOutput>(
          {
            method: "GET",
            path: `/api/fs/list`,
            query: { location: input?.["location"], path: input?.["path"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      find: (input: FilesFindInput, requestOptions?: RequestOptions) =>
        request<FilesFindOutput>(
          {
            method: "GET",
            path: `/api/fs/find`,
            query: { location: input["location"], query: input["query"], type: input["type"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    commands: {
      list: (input?: CommandsListInput, requestOptions?: RequestOptions) =>
        request<CommandsListOutput>(
          {
            method: "GET",
            path: `/api/command`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    skills: {
      list: (input?: SkillsListInput, requestOptions?: RequestOptions) =>
        request<SkillsListOutput>(
          {
            method: "GET",
            path: `/api/skill`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    events: {
      subscribe: (requestOptions?: RequestOptions): AsyncIterable<EventsSubscribeOutput> =>
        sse<EventsSubscribeOutput>(
          { method: "GET", path: `/api/event`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    ptys: {
      list: (input?: PtysListInput, requestOptions?: RequestOptions) =>
        request<PtysListOutput>(
          {
            method: "GET",
            path: `/api/pty`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: PtysCreateInput, requestOptions?: RequestOptions) =>
        request<PtysCreateOutput>(
          {
            method: "POST",
            path: `/api/pty`,
            query: { location: input?.["location"] },
            body: {
              command: input?.["command"],
              args: input?.["args"],
              cwd: input?.["cwd"],
              title: input?.["title"],
              env: input?.["env"],
            },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: PtysGetInput, requestOptions?: RequestOptions) =>
        request<PtysGetOutput>(
          {
            method: "GET",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: PtysUpdateInput, requestOptions?: RequestOptions) =>
        request<PtysUpdateOutput>(
          {
            method: "PUT",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            body: { title: input["title"], size: input["size"] },
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: PtysRemoveInput, requestOptions?: RequestOptions) =>
        request<PtysRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 401, 400],
            empty: true,
          },
          requestOptions,
        ),
    },
    questions: {
      listRequests: (input?: QuestionsListRequestsInput, requestOptions?: RequestOptions) =>
        request<QuestionsListRequestsOutput>(
          {
            method: "GET",
            path: `/api/question/request`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      list: (input: QuestionsListInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: QuestionsListOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      reply: (input: QuestionsReplyInput, requestOptions?: RequestOptions) =>
        request<QuestionsReplyOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/reply`,
            body: { answers: input["answers"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      reject: (input: QuestionsRejectInput, requestOptions?: RequestOptions) =>
        request<QuestionsRejectOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/reject`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    references: {
      list: (input?: ReferencesListInput, requestOptions?: RequestOptions) =>
        request<ReferencesListOutput>(
          {
            method: "GET",
            path: `/api/reference`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    projectCopies: {
      create: (input: ProjectCopiesCreateInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesCreateOutput>(
          {
            method: "POST",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy`,
            query: { location: input["location"] },
            body: { strategy: input["strategy"], directory: input["directory"], name: input["name"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ProjectCopiesRemoveInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesRemoveOutput>(
          {
            method: "DELETE",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy`,
            query: { location: input["location"] },
            body: { directory: input["directory"], force: input["force"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      refresh: (input: ProjectCopiesRefreshInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesRefreshOutput>(
          {
            method: "POST",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy/refresh`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    "server.researchos-assets": {
      fileRead: (input: ServerResearchosAssetsFileReadInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsFileReadOutput>(
          {
            method: "POST",
            path: `/api/researchos-assets/file/read`,
            query: { location: input["location"] },
            body: { kind: input["kind"], scope: input["scope"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      list: (input?: ServerResearchosAssetsListInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsListOutput>(
          {
            method: "GET",
            path: `/api/researchos-assets/api`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      stats: (input?: ServerResearchosAssetsStatsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsStatsOutput>(
          {
            method: "GET",
            path: `/api/researchos-assets/api/stats`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      test: (input: ServerResearchosAssetsTestInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsTestOutput>(
          {
            method: "POST",
            path: `/api/researchos-assets/api/test`,
            query: { location: input["location"] },
            body: { name: input["name"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      fileWrite: (input: ServerResearchosAssetsFileWriteInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsFileWriteOutput>(
          {
            method: "POST",
            path: `/api/researchos-assets/file/write`,
            query: { location: input["location"] },
            body: { kind: input["kind"], name: input["name"], content: input["content"], scope: input["scope"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      noteWrite: (input: ServerResearchosAssetsNoteWriteInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsNoteWriteOutput>(
          {
            method: "POST",
            path: `/api/researchos-assets/note/write`,
            query: { location: input["location"] },
            body: { path: input["path"], content: input["content"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      presetInstall: (input: ServerResearchosAssetsPresetInstallInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosAssetsPresetInstallOutput>(
          {
            method: "POST",
            path: `/api/researchos-assets/preset/install`,
            query: { location: input["location"] },
            body: { pack: input["pack"], target: input["target"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-literature": {
      search: (input: ServerResearchosLiteratureSearchInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureSearchOutput>(
          {
            method: "POST",
            path: `/api/literature/search`,
            query: { location: input["location"] },
            body: { query: input["query"], sources: input["sources"], limit: input["limit"], start: input["start"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      list: (input?: ServerResearchosLiteratureListInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureListOutput>(
          {
            method: "GET",
            path: `/api/literature/papers`,
            query: { location: input?.["location"], limit: input?.["limit"], offset: input?.["offset"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ServerResearchosLiteratureGetInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureGetOutput>(
          {
            method: "GET",
            path: `/api/literature/papers/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      export: (input: ServerResearchosLiteratureExportInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureExportOutput>(
          {
            method: "GET",
            path: `/api/literature/export`,
            query: {
              location: input["location"],
              paperIds: input["paperIds"],
              format: input["format"],
              style: input["style"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      import: (input?: ServerResearchosLiteratureImportInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureImportOutput>(
          {
            method: "POST",
            path: `/api/literature/import`,
            query: { location: input?.["location"] },
            body: {
              path: input?.["path"],
              url: input?.["url"],
              zoteroPath: input?.["zoteroPath"],
              fileName: input?.["fileName"],
              contentBase64: input?.["contentBase64"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      citations: (input: ServerResearchosLiteratureCitationsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureCitationsOutput>(
          {
            method: "GET",
            path: `/api/literature/papers/${encodeURIComponent(input.id)}/citations`,
            query: { location: input["location"], direction: input["direction"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      similar: (input: ServerResearchosLiteratureSimilarInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureSimilarOutput>(
          {
            method: "GET",
            path: `/api/literature/papers/${encodeURIComponent(input.id)}/similar`,
            query: { location: input["location"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      read: (input: ServerResearchosLiteratureReadInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureReadOutput>(
          {
            method: "POST",
            path: `/api/literature/papers/${encodeURIComponent(input.id)}/read`,
            query: { location: input["location"] },
            body: { query: input["query"], k: input["k"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ServerResearchosLiteratureUpdateInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureUpdateOutput>(
          {
            method: "POST",
            path: `/api/literature/papers/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            body: { isRead: input["isRead"], isFavorite: input["isFavorite"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      select: (input?: ServerResearchosLiteratureSelectInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLiteratureSelectOutput>(
          {
            method: "POST",
            path: `/api/literature/selection`,
            query: { location: input?.["location"] },
            body: { paperId: input?.["paperId"], title: input?.["title"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-graph": {
      status: (input?: ServerResearchosGraphStatusInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphStatusOutput>(
          {
            method: "GET",
            path: `/api/graph/status`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      get: (input?: ServerResearchosGraphGetInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphGetOutput>(
          {
            method: "GET",
            path: `/api/graph`,
            query: { location: input?.["location"], type: input?.["type"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      node: (input: ServerResearchosGraphNodeInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphNodeOutput>(
          {
            method: "GET",
            path: `/api/graph/node`,
            query: { location: input["location"], id: input["id"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      ask: (input: ServerResearchosGraphAskInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphAskOutput>(
          {
            method: "POST",
            path: `/api/graph/ask`,
            query: { location: input["location"] },
            body: { question: input["question"], center_node: input["center_node"], depth: input["depth"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      reindex: (input?: ServerResearchosGraphReindexInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphReindexOutput>(
          {
            method: "POST",
            path: `/api/graph/reindex`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      save_layout: (input: ServerResearchosGraphSaveLayoutInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosGraphSaveLayoutOutput>(
          {
            method: "POST",
            path: `/api/graph/layout`,
            query: { location: input["location"] },
            body: { positions: input["positions"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-latex": {
      files: (input?: ServerResearchosLatexFilesInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexFilesOutput>(
          {
            method: "GET",
            path: `/api/latex/files`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      source: (input: ServerResearchosLatexSourceInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexSourceOutput>(
          {
            method: "GET",
            path: `/api/latex/source`,
            query: { location: input["location"], file: input["file"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sourceWrite: (input: ServerResearchosLatexSourceWriteInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexSourceWriteOutput>(
          {
            method: "POST",
            path: `/api/latex/source`,
            query: { location: input["location"] },
            body: { file: input["file"], content: input["content"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      pdf: (input: ServerResearchosLatexPdfInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexPdfOutput>(
          {
            method: "GET",
            path: `/api/latex/pdf`,
            query: { location: input["location"], mainFile: input["mainFile"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      builds: (input?: ServerResearchosLatexBuildsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexBuildsOutput>(
          {
            method: "GET",
            path: `/api/latex/builds`,
            query: { location: input?.["location"], limit: input?.["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      compile: (input: ServerResearchosLatexCompileInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexCompileOutput>(
          {
            method: "POST",
            path: `/api/latex/compile`,
            query: { location: input["location"] },
            body: { mainFile: input["mainFile"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      synctex: (input?: ServerResearchosLatexSynctexInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexSynctexOutput>(
          {
            method: "GET",
            path: `/api/latex/synctex`,
            query: {
              location: input?.["location"],
              mainFile: input?.["mainFile"],
              file: input?.["file"],
              line: input?.["line"],
              pdfPath: input?.["pdfPath"],
              page: input?.["page"],
              x: input?.["x"],
              y: input?.["y"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      format_check: (input: ServerResearchosLatexFormatCheckInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosLatexFormatCheckOutput>(
          {
            method: "POST",
            path: `/api/latex/format-check`,
            query: { location: input["location"] },
            body: { mainFile: input["mainFile"], template: input["template"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-writing": {
      tableToLatex: (input: ServerResearchosWritingTableToLatexInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingTableToLatexOutput>(
          {
            method: "POST",
            path: `/api/writing/table`,
            query: { location: input["location"] },
            body: { csv: input["csv"], caption: input["caption"], label: input["label"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      mdToLatex: (input: ServerResearchosWritingMdToLatexInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingMdToLatexOutput>(
          {
            method: "POST",
            path: `/api/writing/md2latex`,
            query: { location: input["location"] },
            body: { markdown: input["markdown"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      diff: (input: ServerResearchosWritingDiffInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingDiffOutput>(
          {
            method: "POST",
            path: `/api/writing/diff`,
            query: { location: input["location"] },
            body: { original: input["original"], revised: input["revised"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      applyDiff: (input: ServerResearchosWritingApplyDiffInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingApplyDiffOutput>(
          {
            method: "POST",
            path: `/api/writing/diff/apply`,
            query: { location: input["location"] },
            body: { original: input["original"], revised: input["revised"], accepted: input["accepted"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      bibtexFromLibrary: (input: ServerResearchosWritingBibtexFromLibraryInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingBibtexFromLibraryOutput>(
          {
            method: "POST",
            path: `/api/writing/bibtex/library`,
            query: { location: input["location"] },
            body: { paperIds: input["paperIds"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      bibtexUpsert: (input: ServerResearchosWritingBibtexUpsertInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingBibtexUpsertOutput>(
          {
            method: "POST",
            path: `/api/writing/bibtex/upsert`,
            query: { location: input["location"] },
            body: { bibFile: input["bibFile"], entries: input["entries"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      suggestionRecord: (input: ServerResearchosWritingSuggestionRecordInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingSuggestionRecordOutput>(
          {
            method: "POST",
            path: `/api/writing/suggestions`,
            query: { location: input["location"] },
            body: {
              kind: input["kind"],
              targetFile: input["targetFile"],
              inputExcerpt: input["inputExcerpt"],
              output: input["output"],
              status: input["status"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      suggestions: (input?: ServerResearchosWritingSuggestionsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosWritingSuggestionsOutput>(
          {
            method: "GET",
            path: `/api/writing/suggestions`,
            query: { location: input?.["location"], kind: input?.["kind"], limit: input?.["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-data": {
      notebooks: (input?: ServerResearchosDataNotebooksInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataNotebooksOutput>(
          {
            method: "GET",
            path: `/api/data/notebooks`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      cells: (input: ServerResearchosDataCellsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataCellsOutput>(
          {
            method: "GET",
            path: `/api/data/notebooks/${encodeURIComponent(input.id)}/cells`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      cellCreate: (input: ServerResearchosDataCellCreateInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataCellCreateOutput>(
          {
            method: "POST",
            path: `/api/data/notebooks/${encodeURIComponent(input.id)}/cells`,
            query: { location: input["location"] },
            body: { source: input["source"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      cellSave: (input: ServerResearchosDataCellSaveInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataCellSaveOutput>(
          {
            method: "POST",
            path: `/api/data/cells/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            body: { source: input["source"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      cellRun: (input: ServerResearchosDataCellRunInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataCellRunOutput>(
          {
            method: "POST",
            path: `/api/data/cells/${encodeURIComponent(input.id)}/run`,
            query: { location: input["location"] },
            body: { source: input["source"], workdir: input["workdir"], timeoutS: input["timeoutS"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      datasets: (input?: ServerResearchosDataDatasetsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataDatasetsOutput>(
          {
            method: "GET",
            path: `/api/data/datasets`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      artifacts: (input?: ServerResearchosDataArtifactsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataArtifactsOutput>(
          {
            method: "GET",
            path: `/api/data/artifacts`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      artifact: (input: ServerResearchosDataArtifactInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataArtifactOutput>(
          {
            method: "GET",
            path: `/api/data/artifacts/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      artifactFile: (input: ServerResearchosDataArtifactFileInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataArtifactFileOutput>(
          {
            method: "GET",
            path: `/api/data/artifacts/${encodeURIComponent(input.id)}/file`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      statTests: (input?: ServerResearchosDataStatTestsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataStatTestsOutput>(
          {
            method: "GET",
            path: `/api/data/stat-tests`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      link: (input: ServerResearchosDataLinkInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataLinkOutput>(
          {
            method: "POST",
            path: `/api/data/artifacts/${encodeURIComponent(input.id)}/link`,
            query: { location: input["location"] },
            body: { commit: input["commit"], texFile: input["texFile"], texSection: input["texSection"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      datasetRegister: (input: ServerResearchosDataDatasetRegisterInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosDataDatasetRegisterOutput>(
          {
            method: "POST",
            path: `/api/data/datasets/register`,
            query: { location: input["location"] },
            body: { path: input["path"], name: input["name"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-plot": {
      create: (input: ServerResearchosPlotCreateInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotCreateOutput>(
          {
            method: "POST",
            path: `/api/plot/charts`,
            query: { location: input["location"] },
            body: { template: input["template"], data: input["data"], theme: input["theme"], spec: input["spec"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      tune: (input: ServerResearchosPlotTuneInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotTuneOutput>(
          {
            method: "POST",
            path: `/api/plot/charts/${encodeURIComponent(input.id)}/tune`,
            query: { location: input["location"] },
            body: { patch: input["patch"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      annotateSignificance: (input: ServerResearchosPlotAnnotateSignificanceInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotAnnotateSignificanceOutput>(
          {
            method: "POST",
            path: `/api/plot/charts/${encodeURIComponent(input.id)}/significance`,
            query: { location: input["location"] },
            body: { test: input["test"], groups: input["groups"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      mermaid: (input: ServerResearchosPlotMermaidInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotMermaidOutput>(
          {
            method: "POST",
            path: `/api/plot/mermaid`,
            query: { location: input["location"] },
            body: { code: input["code"], name: input["name"], theme: input["theme"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      graphviz: (input: ServerResearchosPlotGraphvizInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotGraphvizOutput>(
          {
            method: "POST",
            path: `/api/plot/graphviz`,
            query: { location: input["location"] },
            body: { dot: input["dot"], engine: input["engine"], name: input["name"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      diagram: (input: ServerResearchosPlotDiagramInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotDiagramOutput>(
          {
            method: "POST",
            path: `/api/plot/diagram`,
            query: { location: input["location"] },
            body: { action: input["action"], file: input["file"], stencilPack: input["stencilPack"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      diagramSave: (input: ServerResearchosPlotDiagramSaveInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotDiagramSaveOutput>(
          {
            method: "POST",
            path: `/api/plot/diagram/save`,
            query: { location: input["location"] },
            body: { file: input["file"], xml: input["xml"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      insertToPaper: (input: ServerResearchosPlotInsertToPaperInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotInsertToPaperOutput>(
          {
            method: "POST",
            path: `/api/plot/insert`,
            query: { location: input["location"] },
            body: {
              artifactPath: input["artifactPath"],
              texFile: input["texFile"],
              section: input["section"],
              caption: input["caption"],
              label: input["label"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      artifacts: (input?: ServerResearchosPlotArtifactsInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotArtifactsOutput>(
          {
            method: "GET",
            path: `/api/plot/artifacts`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      artifactFile: (input: ServerResearchosPlotArtifactFileInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosPlotArtifactFileOutput>(
          {
            method: "GET",
            path: `/api/plot/artifacts/${encodeURIComponent(input.id)}/file`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-reproduce": {
      list: (input?: ServerResearchosReproduceListInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceListOutput>(
          {
            method: "GET",
            path: `/api/reproduce/runs`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [500, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      create: (input: ServerResearchosReproduceCreateInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceCreateOutput>(
          {
            method: "POST",
            path: `/api/reproduce/runs`,
            query: { location: input["location"] },
            body: { paperUrl: input["paperUrl"], repoUrl: input["repoUrl"], envStrategy: input["envStrategy"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ServerResearchosReproduceGetInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceGetOutput>(
          {
            method: "GET",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      advance: (input: ServerResearchosReproduceAdvanceInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceAdvanceOutput>(
          {
            method: "POST",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}/steps/${encodeURIComponent(input.step)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      metricsSubmit: (input: ServerResearchosReproduceMetricsSubmitInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceMetricsSubmitOutput>(
          {
            method: "POST",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}/metrics`,
            query: { location: input["location"] },
            body: { metrics: input["metrics"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      comparison: (input: ServerResearchosReproduceComparisonInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceComparisonOutput>(
          {
            method: "GET",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}/comparison`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      issues: (input: ServerResearchosReproduceIssuesInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceIssuesOutput>(
          {
            method: "GET",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}/issues`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      cancel: (input: ServerResearchosReproduceCancelInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosReproduceCancelOutput>(
          {
            method: "POST",
            path: `/api/reproduce/runs/${encodeURIComponent(input.id)}/cancel`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "server.researchos-translate": {
      run: (input: ServerResearchosTranslateRunInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosTranslateRunOutput>(
          {
            method: "POST",
            path: `/api/translate/run`,
            query: { location: input["location"] },
            body: { paperId: input["paperId"], sections: input["sections"], engine: input["engine"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ServerResearchosTranslateGetInput, requestOptions?: RequestOptions) =>
        request<ServerResearchosTranslateGetOutput>(
          {
            method: "GET",
            path: `/api/translate/${encodeURIComponent(input.paperId)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
  }
}

function appendQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQuery(params, key, item)
    return
  }
  if (typeof value === "object") {
    for (const [child, item] of Object.entries(value)) appendQuery(params, `${key}[${child}]`, item)
    return
  }
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}

function isContentType(response: Response, expected: string) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected
}

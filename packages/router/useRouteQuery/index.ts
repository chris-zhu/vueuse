import { customRef, nextTick, watch } from 'vue-demi'
import { toValue, tryOnScopeDispose } from '@vueuse/shared'
import { useRoute, useRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { Ref } from 'vue-demi'
import type { MaybeRefOrGetter } from '@vueuse/shared'
import type { ReactiveRouteOptionsWithTransform, RouteQueryValueRaw } from '../_types'

const _queue = new WeakMap<Router, Map<string, any>>()

export function useRouteQuery(
  name: string
): Ref<null | string | string[]>

export function useRouteQuery<
  T extends RouteQueryValueRaw = RouteQueryValueRaw,
  K = T,
>(
  name: string,
  defaultValue?: MaybeRefOrGetter<T>,
  options?: ReactiveRouteOptionsWithTransform<T, K>
): Ref<K>

export function useRouteQuery<
  T extends RouteQueryValueRaw = RouteQueryValueRaw,
  K = T,
>(
  name: string,
  defaultValue?: MaybeRefOrGetter<T>,
  options: ReactiveRouteOptionsWithTransform<T, K> = {},
): Ref<K> {
  const {
    mode = 'replace',
    route = useRoute(),
    router = useRouter(),
    transform = value => value as any as K,
    serializer,
  } = options

  if (!_queue.has(router))
    _queue.set(router, new Map())

  const _queriesQueue = _queue.get(router)!

  let query = route.query[name] as any

  const _serializer = {
    read: transform ?? (value => value),
    write: (value: any) => value as T,
    ...serializer,
  }

  tryOnScopeDispose(() => {
    query = undefined
  })

  let _trigger: () => void

  const proxy = customRef<any>((track, trigger) => {
    _trigger = trigger

    return {
      get() {
        track()

        return _serializer.read(query !== undefined ? query : toValue(defaultValue))
      },
      set(_v) {
        const v = _serializer.write(_v)
        if (query === v)
          return

        query = (v === defaultValue || v === null) ? undefined : v
        _queriesQueue.set(name, (v === defaultValue || v === null) ? undefined : v)

        trigger()

        nextTick(() => {
          if (_queriesQueue.size === 0)
            return

          const newQueries = Object.fromEntries(_queriesQueue.entries())
          _queriesQueue.clear()

          const { params, query, hash } = route

          router[toValue(mode)]({
            params,
            query: { ...query, ...newQueries },
            hash,
          })
        })
      },
    }
  })

  watch(
    () => route.query[name],
    (v) => {
      console.log('watch', v)

      query = v

      _trigger()
    },
    { flush: 'sync' },
  )

  return proxy as any as Ref<K>
}

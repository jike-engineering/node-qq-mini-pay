import { createHmac } from 'crypto'
import got from 'got'
import { nanoid } from 'nanoid/async'
import _ from 'lodash'

const host = 'https://api.q.qq.com'

export enum ErrCode {
  SUCCESS = 0,
  BUSY = -1,
  ACCESS_TOKEN_ERROR = -3000,
  QQ_SIG_ERROR = 90009,
  UNAUTHORIZED = 90010,
  SIG_ERROR = 90011,
  BILL_EXISTS = 90012,
  INSUFFICIENT_BALANCE = 90013,
  PERMISSION_DENIED = 90017,
  PARAMS_ERROR = 90018,
}

export type User = {
  openId: string
  sessionKey: string
  zoneId?: string
}

const keys = [
  'amt',
  'app_remark',
  'appid',
  'bill_no',
  'offer_id',
  'openid',
  'openkey',
  'pay_item',
  'pf',
  'ts',
  'user_ip',
  'zone_id',
] as [
  'amt',
  'app_remark',
  'appid',
  'bill_no',
  'offer_id',
  'openid',
  'openkey',
  'pay_item',
  'pf',
  'ts',
  'user_ip',
  'zone_id',
]

const qqkeys = ['access_token', 'appid', 'offer_id', 'openid', 'pf', 'sig', 'ts', 'zone_id'] as [
  'access_token',
  'appid',
  'offer_id',
  'openid',
  'pf',
  'sig',
  'ts',
  'zone_id',
]

export class MiniPay {
  readonly #appId: string
  readonly #appKey: string
  readonly #offerId: string
  readonly #sandbox?: boolean
  readonly #getAccessToken: () => Promise<string>

  constructor(params: {
    appId: string
    appKey: string
    offerId: string
    sandbox?: boolean
    getAccessToken: () => Promise<string>
  }) {
    this.#appId = params.appId
    this.#appKey = params.appKey
    this.#offerId = params.offerId
    this.#sandbox = params.sandbox
    this.#getAccessToken = params.getAccessToken
  }

  public async pay(
    user: User,
    params: {
      amt: number
      userIp?: string
      payItem?: string
      appRemark?: string
    },
  ): Promise<{
    errCode: ErrCode
    errMsg: string
    billNo: string
    balance: number
    usedGenAmt: number
    tradeId: string
  }> {
    return this.base('/api/json/openApiPay/MiniPay', user, {
      bill_no: await nanoid(),
      amt: params.amt,
      user_ip: params.userIp,
      pay_item: params.payItem,
      app_remark: params.appRemark,
    })
  }

  public async getBalance(
    user: User,
  ): Promise<{
    errCode: ErrCode
    errMsg: string
    remainder: number
  }> {
    return this.base('/api/json/openApiPay/MiniGetBalance', user, {})
  }

  public async present(
    user: User,
    params: {
      presentCounts: number
      userIp?: string
    },
  ): Promise<{
    errCode: ErrCode
    errMsg: string
    billNo: string
    balance: number
  }> {
    return this.base('/api/json/openApiPay/MiniPresent', user, {
      bill_no: await nanoid(),
      present_counts: params.presentCounts,
      user_ip: params.userIp,
    })
  }

  protected async base<
    P extends object,
    T extends {
      errCode: ErrCode
      errMsg: string
    }
  >(method: string, user: User, params: P): Promise<T> {
    const payload = {
      openid: user.openId,
      openkey: user.sessionKey,
      appid: this.#appId,
      offer_id: this.#offerId,
      ts: Math.round(Date.now() / 1000),
      zone_id: user.zoneId || '1',
      pf: `qqapp_qq-2001-android-2011-${this.#appId}`,
    }
    const access_token = await this.#getAccessToken()
    const data = await got(`${host}${method}`, {
      method: 'POST',
      searchParams: {
        access_token,
      },
      json: {
        ...payload,
        pfkey: 'pfKey',
        ...params,
        sig: this.sig(method, { ...payload, ...params }),
        sandbox_env: this.#sandbox ? 1 : 0,
        qq_sig: this.qqSig(method, user.sessionKey, {
          access_token,
          ...payload,
        }),
      },
    }).json<{
      errcode: ErrCode
      errmsg: string
    }>()
    return {
      errCode: data.errcode,
      errMsg: data.errmsg,
      ...(_(data).omit('errcode', 'errmsg').mapValues(_.camelCase).value() as any),
    }
  }

  private sig(method: string, obj: { [key in typeof keys[number]]?: string | number }): string {
    return createHmac('sha1', this.#appKey)
      .update(
        `POST&${encodeURIComponent(method)}&${encodeURIComponent(
          keys.map((key) => `${key}=${obj[key] || ''}`).join('&'),
        )}`,
      )
      .digest('base64')
  }

  private qqSig(
    method: string,
    sessionKey: string,
    obj: { [key in typeof qqkeys[number]]?: string | number },
  ): string {
    return createHmac('sha1', `${sessionKey}&`)
      .update(
        `POST&${encodeURIComponent(method)}&${encodeURIComponent(
          qqkeys.map((key) => `${key}=${obj[key] || ''}`).join('&'),
        )}`,
      )
      .digest('base64')
  }
}

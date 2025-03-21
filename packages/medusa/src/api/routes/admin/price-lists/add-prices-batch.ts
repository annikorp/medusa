import { MedusaV2Flag } from "@medusajs/utils"
import { updatePriceLists } from "@medusajs/core-flows"
import { Type } from "class-transformer"
import { IsArray, IsBoolean, IsOptional, ValidateNested } from "class-validator"
import { EntityManager } from "typeorm"
import { defaultAdminPriceListFields, defaultAdminPriceListRelations } from "."
import { PriceList } from "../../../.."
import PriceListService from "../../../../services/price-list"
import { AdminPriceListPricesUpdateReq } from "../../../../types/price-list"
import { validator } from "../../../../utils/validator"
import { MedusaContainer } from "@medusajs/types"
import { getPriceListPricingModule } from "./modules-queries"

/**
 * @oas [post] /admin/price-lists/{id}/prices/batch
 * operationId: "PostPriceListsPriceListPricesBatch"
 * summary: "Add or Update Prices"
 * description: "Add or update a list of prices in a Price List."
 * x-authenticated: true
 * parameters:
 *   - (path) id=* {string} The ID of the Price List.
 * requestBody:
 *  content:
 *    application/json:
 *      schema:
 *        $ref: "#/components/schemas/AdminPostPriceListPricesPricesReq"
 * x-codegen:
 *   method: addPrices
 * x-codeSamples:
 *   - lang: JavaScript
 *     label: JS Client
 *     source: |
 *       import Medusa from "@medusajs/medusa-js"
 *       const medusa = new Medusa({ baseUrl: MEDUSA_BACKEND_URL, maxRetries: 3 })
 *       // must be previously logged in or use api token
 *       medusa.admin.priceLists.addPrices(priceListId, {
 *         prices: [
 *           {
 *             amount: 1000,
 *             variant_id,
 *             currency_code: "eur"
 *           }
 *         ]
 *       })
 *       .then(({ price_list }) => {
 *         console.log(price_list.id);
 *       })
 *   - lang: Shell
 *     label: cURL
 *     source: |
 *       curl -X POST '{backend_url}/admin/price-lists/{id}/prices/batch' \
 *       -H 'x-medusa-access-token: {api_token}' \
 *       -H 'Content-Type: application/json' \
 *       --data-raw '{
 *           "prices": [
 *             {
 *               "amount": 100,
 *               "variant_id": "afasfa",
 *               "currency_code": "eur"
 *             }
 *           ]
 *       }'
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 *   - jwt_token: []
 * tags:
 *   - Price Lists
 * responses:
 *   200:
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           $ref: "#/components/schemas/AdminPriceListRes"
 *   "400":
 *     $ref: "#/components/responses/400_error"
 *   "401":
 *     $ref: "#/components/responses/unauthorized"
 *   "404":
 *     $ref: "#/components/responses/not_found_error"
 *   "409":
 *     $ref: "#/components/responses/invalid_state_error"
 *   "422":
 *     $ref: "#/components/responses/invalid_request_error"
 *   "500":
 *     $ref: "#/components/responses/500_error"
 */
export default async (req, res) => {
  const { id } = req.params
  let priceList
  const featureFlagRouter = req.scope.resolve("featureFlagRouter")
  const manager: EntityManager = req.scope.resolve("manager")
  const priceListService: PriceListService =
    req.scope.resolve("priceListService")

  const validated = await validator(AdminPostPriceListPricesPricesReq, req.body)

  if (featureFlagRouter.isFeatureEnabled(MedusaV2Flag.key)) {
    const updatePriceListWorkflow = updatePriceLists(req.scope)

    const input = {
      price_lists: [
        {
          id,
          ...validated,
        },
      ],
    }

    await updatePriceListWorkflow.run({
      input,
      context: {
        manager,
      },
    })

    priceList = await getPriceListPricingModule(id, {
      container: req.scope as MedusaContainer,
    })
  } else {
    await manager.transaction(async (transactionManager) => {
      await priceListService
        .withTransaction(transactionManager)
        .addPrices(id, validated.prices, validated.override)
    })

    priceList = await priceListService.retrieve(id, {
      select: defaultAdminPriceListFields as (keyof PriceList)[],
      relations: defaultAdminPriceListRelations,
    })
  }

  res.json({ price_list: priceList })
}

/**
 * @schema AdminPostPriceListPricesPricesReq
 * type: object
 * properties:
 *   prices:
 *     description: The prices to update or add.
 *     type: array
 *     items:
 *       type: object
 *       required:
 *         - amount
 *         - variant_id
 *       properties:
 *         id:
 *           description: The ID of the price.
 *           type: string
 *         region_id:
 *           description: The ID of the Region for which the price is used. This is only required if `currecny_code` is not provided.
 *           type: string
 *         currency_code:
 *           description: The 3 character ISO currency code for which the price will be used. This is only required if `region_id` is not provided.
 *           type: string
 *           externalDocs:
 *             url: https://en.wikipedia.org/wiki/ISO_4217#Active_codes
 *             description: See a list of codes.
 *         variant_id:
 *           description: The ID of the Variant for which the price is used.
 *           type: string
 *         amount:
 *           description: The amount to charge for the Product Variant.
 *           type: integer
 *         min_quantity:
 *           description: The minimum quantity for which the price will be used.
 *           type: integer
 *         max_quantity:
 *           description: The maximum quantity for which the price will be used.
 *           type: integer
 *   override:
 *     description: >-
 *       If set to `true`, the prices will replace all existing prices associated with the Price List.
 *     type: boolean
 */
export class AdminPostPriceListPricesPricesReq {
  @IsArray()
  @Type(() => AdminPriceListPricesUpdateReq)
  @ValidateNested({ each: true })
  prices: AdminPriceListPricesUpdateReq[]

  @IsOptional()
  @IsBoolean()
  override?: boolean
}

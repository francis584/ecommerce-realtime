'use strict'

/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

/**
 * Resourceful controller for interacting with orders
 */
const Order = use('App/Models/Order')
const Database = use('Database')
const OrderService = use('App/Services/Order/OrderService')
const Coupon = use('App/Models/Coupon')
const Discount = use('App/Models/Discount')
const OrderTransformer = use('App/Transformers/Admin/OrderTransformer')
const Ws = use('Ws')
class OrderController {
  /**
   * Show a list of all orders.
   * GET orders
   *
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Response} ctx.response
   * @param {View} ctx.view
   */
  async index ({ request, response, pagination, transform, auth }) {
    const query = Order.query()
    const client = await auth.getUser()
    query.where('user_id', client.id)

    const number = request.input('number')

    if(number) {
      query.where('id', 'LIKE',`${number}`)
    }

    const results = await query.orderBy('id','DESC').paginate(pagination.page, pagination.limit)

    const transformedOrders = await transform.paginate(results, OrderTransformer)
    return response.send(transformedOrders)
  }

  /**
   * Create/save a new order.
   * POST orders
   *
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Response} ctx.response
   */
  async store ({ request, response, transform, auth }) {
    const transaction = await Database.beginTransaction()

    try {
      const items = request.input('items')
      const client = await auth.getUser()

      const order = await Order.create({ user_id: client.id }, transaction)

      const orderService = new OrderService(order, transaction)

      if (items.length > 0 ) {
        await orderService.syncItems(items)
      }

      await transaction.commit()

      const orderCreated = await Order.find(order.id)
      const transformedOrder = await transform
      .include('items')
      .item(orderCreated, OrderTransformer)

      const topic = Ws.getChannel('notifications').topic('notifications')

      if (topic) {
        topic.broadcast('new:order', transformedOrder)
      }

      return response.status(201).send(transformedOrder)
    } catch (error) {
      await transaction.rollback()

      return response.status(400).send({
        message: 'Não foi possível criar o pedido no momento!'
      })
    }
  }

  /**
   * Display a single order.
   * GET orders/:id
   *
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Response} ctx.response
   * @param {View} ctx.view
   */
  async show ({ params: { id }, response, transform, auth }) {
    const client = await auth.getUser()
    const result = await Order.query()
    .where('user_id', client.id)
    .where('id', id)
    .firstOrFail()

    const transformedOrder = await transform.item(result, OrderTransformer)

    return response.send(transformedOrder)
  }

  /**
   * Update order details.
   * PUT or PATCH orders/:id
   *
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Response} ctx.response
   */
  async update ({ params: { id }, request, response, transform, auth }) {
    const client = await auth.getUser()
    const order = await Order.query()
    .where('user_id', client.id)
    .where('id', id)
    .firstOrFail()

    const transaction = await Database.beginTransaction()

    try {
      const { items, status } = request.all()
      order.merge({user_id: client.id, status })

      const orderService = new OrderService(order, transaction)

      await orderService.updateItems(items)

      await order.save(transaction)

      await transaction.commit()

      const transformedOrder = await transform
      .include('items,coupons,discounts')
      .item(order, OrderTransformer)

      return response.send(transformedOrder)
    } catch (error) {
      await transaction.rollback()

      return response.status(400).send({
        message: 'Não foi possível atualizar este pedido no momento!'
      })
    }
  }
  /**
   * Não terá metodo destroy pq o cliente não apaga o pedido, ele cancela.
   */

  async applyDiscount({ params: { id }, request, response, transform, auth }) {
    const { code } = request.all()
    const coupon = await Coupon.findByOrFail('code', code.toUpperCase())
    const client = await auth.getUser()
    const order = await Order.query()
    .where('user_id', client.id)
    .where('id', id)
    .firstOrFail()

    let discount, info = {}

    try {
      const orderService = new OrderService(order)
      const canAddDiscount = await orderService.canApplyDiscount(coupon)
      const orderDiscounts = await order.coupons().getCount()

      const canApplyToOrder = orderDiscounts < 1 || (orderDiscounts >= 1 && coupon.recursive)

      if (canAddDiscount && canApplyToOrder) {
        discount = await Discount.findOrCreate({
          order_id: order.id,
          coupon_id: coupon.id
        })

        info.message = 'Cupom aplicado com sucesso!'
        info.success = true
      }else {
        info.message = 'Não foi possível aplicar este cupom!'
        info.success = false
      }
      const transformedOrder = await transform.include('items,user,discounts,coupons').item(order, OrderTransformer)
      return response.send({ transformedOrder, info })
    } catch (error) {
      return response.status(400).send({ message: 'Erro ao aplicar o cupom!'})
    }
  }

  async removeDiscount({params: { id }, request, response, auth}) {
    const { discount_id } = request.all()
    const discount = await Discount.findOrFail(discount_id)
    await discount.delete()
    return response.status(204).send()
  }
}

module.exports = OrderController

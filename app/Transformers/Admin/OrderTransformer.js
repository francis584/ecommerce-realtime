'use strict'

const BumblebeeTransformer = use('Bumblebee/Transformer')

/**
 * OrderTransformer class
 *
 * @class OrderTransformer
 * @constructor
 */
class OrderTransformer extends BumblebeeTransformer {
  /**
   * This method is used to transform the data.
   */
  availableInclude() {
    return ['user', 'coupons', 'items', 'discounts']
  }

  transform (order) {
    order = order.toJSON()
    return {
     // add your transformation object here
     id: order.id,
     status: order.status,
     date: order.created_at,
     total: order.total ? parseFloat(order.total.toFixed(2)) : 0,
     qty_items: order.__meta__ && order.__meta__.qty_items ? order.__meta__.qty_items : 0,
     discount: order.__meta__ && order.__meta__.discount ? order.__meta__.discount : 0,
     subtotal: order.__meta__ && order.__meta__.subtotal ? order.__meta__.subtotal : 0,
    }
  }
}

module.exports = OrderTransformer

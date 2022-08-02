(module
  (func (export "add") (param $n1 i32) (param $n2 i32) (result i32)
    local.get $n1
    local.get $n2
    i32.add
  )
)

use autoangel_core::elements::value::ReadValue;
use pyo3::prelude::*;

pub(crate) struct PyReadValue(pub ReadValue);

impl<'py> IntoPyObject<'py> for PyReadValue {
    type Target = PyAny;
    type Output = Bound<'py, Self::Target>;
    type Error = PyErr;

    fn into_pyobject(self, py: Python<'py>) -> Result<Self::Output, Self::Error> {
        Ok(match self.0 {
            ReadValue::Integer(value) => value.into_pyobject(py)?.into_any(),
            ReadValue::Float(value) => value.into_pyobject(py)?.into_any(),
            ReadValue::Double(value) => value.into_pyobject(py)?.into_any(),
            ReadValue::String(value) => value.into_pyobject(py)?.into_any(),
            ReadValue::Bytes(value) => value.into_pyobject(py)?.into_any(),
        })
    }
}

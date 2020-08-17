import React, { useState } from 'react';
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Tabs, Tab, Box } from '@material-ui/core';
import PropTypes from 'prop-types';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`browse-${index}`}
      aria-labelledby={`browse-${index}`}
      {...other}
    >
      <Box>{children}</Box>
    </Typography>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `browse-${index}`,
    'aria-controls': `browse-${index}`,
  };
}

export default function BrowseIndex({ data })  {
  const classes = useStyles();
  const [activeTab, setTab] = useState(0);
  const handleChange = (event, newValue) => {
    setTab(newValue);
  };

  return(
    <Layout>
      <Container maxWidth="lg">
        <Box className={classes.results}>
          <Tabs 
            value={activeTab} 
            aria-label="browse tabs"
            onChange={handleChange}
            indicatorColor="primary"
            textColor="primary"
            // variant="fullWidth"
            // centered
          >
            <Tab label="Bible" className={classes.tab}  {...a11yProps(0)}  disableRipple />
            <Tab label="People" className={classes.tab} {...a11yProps(1)} disableRipple />
            <Tab label="Places" className={classes.tab} {...a11yProps(2)} disableRipple />
          </Tabs>
        </Box> 

        <TabPanel value={activeTab} index={0} >
          <h1>Books of the Bible</h1>
          {data.neo4j.Testament.map(testament => (
            <>
              <h3>{testament.title}</h3>
              <div className="index-group">
                {testament.books.map(book => (
                  <Link to={book.slug} key={book.slug}>{book.title}</Link>
                ))}
              </div>
            </>
          ))}
        </TabPanel>

        <TabPanel value={activeTab} index={1} >
          <h1>All People in the Bible</h1>
        </TabPanel>

        <TabPanel value={activeTab} index={2} >
          <h1>All Places in the Bible</h1>
        </TabPanel>

      </Container>

      <div className="footer"></div>
    </Layout>
  )
}

export const query = graphql `
  {
    neo4j {
      Testament (orderBy:title_desc){
        title
        books (orderBy:bookOrder_asc){
          title
          slug
          bookOrder
        }
      }
    }
  }
  `

const useStyles = makeStyles(theme => ({
  tab:{
    minWidth:0,
  }
}));
